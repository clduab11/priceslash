import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// Heatmap data schema
const HeatmapPointSchema = z.object({
  market_id: z.string(),
  region_name: z.string(),
  latitude: z.number(),
  longitude: z.number(),
  avg_price: z.number(),
  min_price: z.number(),
  max_price: z.number(),
  vendor_count: z.number(),
  sku_count: z.number(),
  price_index: z.number(), // Relative price index (100 = average)
  variance_level: z.enum(['low', 'medium', 'high']),
});

export type HeatmapPoint = z.infer<typeof HeatmapPointSchema>;

// Mock heatmap data for MVP
const mockHeatmapData: HeatmapPoint[] = [
  {
    market_id: 'MKT-NORTHEAST',
    region_name: 'Northeast',
    latitude: 40.7128,
    longitude: -74.0060,
    avg_price: 45.50,
    min_price: 32.00,
    max_price: 89.99,
    vendor_count: 8,
    sku_count: 45,
    price_index: 105,
    variance_level: 'medium',
  },
  {
    market_id: 'MKT-SOUTHEAST',
    region_name: 'Southeast',
    latitude: 33.7490,
    longitude: -84.3880,
    avg_price: 42.00,
    min_price: 28.50,
    max_price: 78.00,
    vendor_count: 6,
    sku_count: 38,
    price_index: 97,
    variance_level: 'low',
  },
  {
    market_id: 'MKT-WEST',
    region_name: 'West Coast',
    latitude: 34.0522,
    longitude: -118.2437,
    avg_price: 52.00,
    min_price: 35.00,
    max_price: 95.00,
    vendor_count: 10,
    sku_count: 52,
    price_index: 120,
    variance_level: 'high',
  },
  {
    market_id: 'MKT-MIDWEST',
    region_name: 'Midwest',
    latitude: 41.8781,
    longitude: -87.6298,
    avg_price: 38.00,
    min_price: 25.00,
    max_price: 65.00,
    vendor_count: 5,
    sku_count: 30,
    price_index: 88,
    variance_level: 'low',
  },
  {
    market_id: 'MKT-SOUTHWEST',
    region_name: 'Southwest',
    latitude: 33.4484,
    longitude: -112.0740,
    avg_price: 44.00,
    min_price: 30.00,
    max_price: 82.00,
    vendor_count: 4,
    sku_count: 25,
    price_index: 102,
    variance_level: 'medium',
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const skuId = searchParams.get('sku_id');
    const categoryId = searchParams.get('category_id');
    const vendorId = searchParams.get('vendor_id');

    // In production, filter based on params
    // For MVP, return all mock data
    let data = [...mockHeatmapData];

    // Calculate summary statistics
    const totalAvgPrice = data.reduce((sum, p) => sum + p.avg_price, 0) / data.length;
    const totalVendors = new Set(data.flatMap(p => p.market_id)).size;
    const totalSKUs = data.reduce((sum, p) => sum + p.sku_count, 0);

    // Calculate price range for color scaling
    const minAvg = Math.min(...data.map(p => p.avg_price));
    const maxAvg = Math.max(...data.map(p => p.avg_price));

    return NextResponse.json({
      success: true,
      data: {
        points: data,
        summary: {
          total_regions: data.length,
          avg_price_global: totalAvgPrice,
          min_avg_price: minAvg,
          max_avg_price: maxAvg,
          total_vendors: totalVendors,
          total_skus: totalSKUs,
          price_spread_pct: ((maxAvg - minAvg) / minAvg * 100).toFixed(2),
        },
        filters: {
          sku_id: skuId,
          category_id: categoryId,
          vendor_id: vendorId,
        },
      },
    });
  } catch (error) {
    console.error('Error fetching heatmap data:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch heatmap data' },
      { status: 500 }
    );
  }
}

// Endpoint for regional price comparison
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { region_ids, sku_ids } = body;

    if (!region_ids || !Array.isArray(region_ids)) {
      return NextResponse.json(
        { success: false, error: 'region_ids array is required' },
        { status: 400 }
      );
    }

    // Filter to requested regions
    const filteredData = mockHeatmapData.filter(p =>
      region_ids.includes(p.market_id)
    );

    // Calculate comparison metrics
    const comparison = filteredData.map(region => ({
      ...region,
      price_vs_average: region.avg_price - (mockHeatmapData.reduce((s, p) => s + p.avg_price, 0) / mockHeatmapData.length),
    }));

    return NextResponse.json({
      success: true,
      data: {
        regions: comparison,
        comparison_summary: {
          cheapest_region: comparison.reduce((min, r) => r.avg_price < min.avg_price ? r : min, comparison[0]),
          most_expensive_region: comparison.reduce((max, r) => r.avg_price > max.avg_price ? r : max, comparison[0]),
          price_range: Math.max(...comparison.map(r => r.avg_price)) - Math.min(...comparison.map(r => r.avg_price)),
        },
      },
    });
  } catch (error) {
    console.error('Error comparing regions:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to compare regions' },
      { status: 500 }
    );
  }
}
