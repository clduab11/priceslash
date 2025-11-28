import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Vendor relationship matrix schema
const VendorMatrixEntrySchema = z.object({
  vendor_id: z.string(),
  vendor_name: z.string(),
  total_skus: z.number(),
  regions_covered: z.number(),
  avg_price_index: z.number(),
  reliability_score: z.number().nullable(),
  shared_skus: z.record(z.string(), z.number()), // vendor_id -> shared SKU count
  competitiveness: z.object({
    below_market_pct: z.number(),
    at_market_pct: z.number(),
    above_market_pct: z.number(),
  }),
});

export type VendorMatrixEntry = z.infer<typeof VendorMatrixEntrySchema>;

// Mock vendor matrix data
const mockVendorMatrix: VendorMatrixEntry[] = [
  {
    vendor_id: 'V-001',
    vendor_name: 'TechSupply Co',
    total_skus: 45,
    regions_covered: 4,
    avg_price_index: 98,
    reliability_score: 92,
    shared_skus: {
      'V-002': 28,
      'V-003': 15,
      'V-004': 32,
      'V-005': 8,
    },
    competitiveness: {
      below_market_pct: 45,
      at_market_pct: 35,
      above_market_pct: 20,
    },
  },
  {
    vendor_id: 'V-002',
    vendor_name: 'Global Electronics',
    total_skus: 62,
    regions_covered: 5,
    avg_price_index: 105,
    reliability_score: 88,
    shared_skus: {
      'V-001': 28,
      'V-003': 22,
      'V-004': 18,
      'V-005': 12,
    },
    competitiveness: {
      below_market_pct: 30,
      at_market_pct: 40,
      above_market_pct: 30,
    },
  },
  {
    vendor_id: 'V-003',
    vendor_name: 'Natural Foods Dist',
    total_skus: 38,
    regions_covered: 3,
    avg_price_index: 95,
    reliability_score: 95,
    shared_skus: {
      'V-001': 15,
      'V-002': 22,
      'V-004': 10,
      'V-005': 25,
    },
    competitiveness: {
      below_market_pct: 55,
      at_market_pct: 30,
      above_market_pct: 15,
    },
  },
  {
    vendor_id: 'V-004',
    vendor_name: 'Midwest Wholesale',
    total_skus: 55,
    regions_covered: 2,
    avg_price_index: 92,
    reliability_score: 85,
    shared_skus: {
      'V-001': 32,
      'V-002': 18,
      'V-003': 10,
      'V-005': 5,
    },
    competitiveness: {
      below_market_pct: 60,
      at_market_pct: 25,
      above_market_pct: 15,
    },
  },
  {
    vendor_id: 'V-005',
    vendor_name: 'Pacific Trade Corp',
    total_skus: 30,
    regions_covered: 2,
    avg_price_index: 110,
    reliability_score: 78,
    shared_skus: {
      'V-001': 8,
      'V-002': 12,
      'V-003': 25,
      'V-004': 5,
    },
    competitiveness: {
      below_market_pct: 20,
      at_market_pct: 35,
      above_market_pct: 45,
    },
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const vendorId = searchParams.get('vendor_id');
    const minSharedSkus = parseInt(searchParams.get('min_shared_skus') || '0');

    let data = [...mockVendorMatrix];

    // Filter by specific vendor if requested
    if (vendorId) {
      data = data.filter(v => v.vendor_id === vendorId);
    }

    // Build relationship matrix
    const matrix: {
      vendors: string[];
      relationships: number[][];
      metadata: Record<string, {
        name: string;
        total_skus: number;
        avg_price_index: number;
      }>;
    } = {
      vendors: mockVendorMatrix.map(v => v.vendor_id),
      relationships: [],
      metadata: {},
    };

    // Create adjacency matrix for shared SKUs
    for (const vendor of mockVendorMatrix) {
      const row: number[] = [];
      for (const otherVendor of mockVendorMatrix) {
        if (vendor.vendor_id === otherVendor.vendor_id) {
          row.push(vendor.total_skus); // Diagonal = total SKUs
        } else {
          const shared = vendor.shared_skus[otherVendor.vendor_id] || 0;
          row.push(shared >= minSharedSkus ? shared : 0);
        }
      }
      matrix.relationships.push(row);
      matrix.metadata[vendor.vendor_id] = {
        name: vendor.vendor_name,
        total_skus: vendor.total_skus,
        avg_price_index: vendor.avg_price_index,
      };
    }

    // Calculate network metrics
    const totalConnections = mockVendorMatrix.reduce((sum, v) =>
      sum + Object.values(v.shared_skus).filter(s => s >= minSharedSkus).length,
      0
    ) / 2; // Divide by 2 since relationships are bidirectional

    const avgSharedSkus = mockVendorMatrix.reduce((sum, v) =>
      sum + Object.values(v.shared_skus).reduce((s, n) => s + n, 0),
      0
    ) / (mockVendorMatrix.length * (mockVendorMatrix.length - 1));

    return NextResponse.json({
      success: true,
      data: {
        vendors: data,
        matrix,
        network_metrics: {
          total_vendors: mockVendorMatrix.length,
          total_connections: totalConnections,
          avg_shared_skus: avgSharedSkus.toFixed(1),
          network_density: (totalConnections / (mockVendorMatrix.length * (mockVendorMatrix.length - 1) / 2) * 100).toFixed(1),
        },
      },
    });
  } catch (error) {
    console.error('Error fetching vendor matrix:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch vendor matrix' },
      { status: 500 }
    );
  }
}

// Get detailed vendor comparison
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { vendor_ids, sku_ids } = body;

    if (!vendor_ids || !Array.isArray(vendor_ids) || vendor_ids.length < 2) {
      return NextResponse.json(
        { success: false, error: 'At least 2 vendor_ids are required for comparison' },
        { status: 400 }
      );
    }

    const selectedVendors = mockVendorMatrix.filter(v =>
      vendor_ids.includes(v.vendor_id)
    );

    if (selectedVendors.length < 2) {
      return NextResponse.json(
        { success: false, error: 'Could not find enough vendors to compare' },
        { status: 404 }
      );
    }

    // Calculate comparison metrics
    const comparison = {
      vendors: selectedVendors.map(v => ({
        vendor_id: v.vendor_id,
        vendor_name: v.vendor_name,
        total_skus: v.total_skus,
        avg_price_index: v.avg_price_index,
        reliability_score: v.reliability_score,
        competitiveness: v.competitiveness,
      })),
      shared_skus_between_selected: 0,
      price_comparison: {
        cheapest_vendor: '',
        most_expensive_vendor: '',
        price_spread: 0,
      },
      recommendations: [] as string[],
    };

    // Find shared SKUs between selected vendors
    if (selectedVendors.length === 2) {
      comparison.shared_skus_between_selected =
        selectedVendors[0].shared_skus[selectedVendors[1].vendor_id] || 0;
    }

    // Price comparison
    const sortedByPrice = [...selectedVendors].sort((a, b) => a.avg_price_index - b.avg_price_index);
    comparison.price_comparison = {
      cheapest_vendor: sortedByPrice[0].vendor_name,
      most_expensive_vendor: sortedByPrice[sortedByPrice.length - 1].vendor_name,
      price_spread: sortedByPrice[sortedByPrice.length - 1].avg_price_index - sortedByPrice[0].avg_price_index,
    };

    // Generate recommendations
    const mostCompetitive = selectedVendors.reduce((best, v) =>
      v.competitiveness.below_market_pct > best.competitiveness.below_market_pct ? v : best
    );
    comparison.recommendations.push(
      `${mostCompetitive.vendor_name} offers the most competitive pricing (${mostCompetitive.competitiveness.below_market_pct}% below market)`
    );

    const mostReliable = selectedVendors.reduce((best, v) =>
      (v.reliability_score || 0) > (best.reliability_score || 0) ? v : best
    );
    if (mostReliable.reliability_score) {
      comparison.recommendations.push(
        `${mostReliable.vendor_name} has the highest reliability score (${mostReliable.reliability_score}%)`
      );
    }

    return NextResponse.json({
      success: true,
      data: comparison,
    });
  } catch (error) {
    console.error('Error comparing vendors:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to compare vendors' },
      { status: 500 }
    );
  }
}
