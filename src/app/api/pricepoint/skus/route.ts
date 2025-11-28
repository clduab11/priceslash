import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// SKU Search Query Schema
const SearchQuerySchema = z.object({
  query: z.string().optional(),
  category: z.string().optional(),
  supplier: z.string().optional(),
  region: z.string().optional(),
  minPrice: z.number().optional(),
  maxPrice: z.number().optional(),
  page: z.number().default(1),
  limit: z.number().default(20),
});

// SKU Response Schema
const SKUSchema = z.object({
  sku_id: z.string(),
  product_name: z.string(),
  description: z.string().nullable(),
  category_id: z.string().nullable(),
  category_name: z.string().nullable(),
  brand: z.string().nullable(),
  manufacturer: z.string().nullable(),
  weight_kg: z.number().nullable(),
  is_active: z.boolean(),
  pricing: z.array(z.object({
    vendor_id: z.string(),
    vendor_name: z.string(),
    unit_price: z.number(),
    currency_code: z.string(),
    market_id: z.string().nullable(),
    region_name: z.string().nullable(),
    stock_status: z.string(),
    last_updated: z.string(),
  })).optional(),
});

export type SKU = z.infer<typeof SKUSchema>;

// Mock data for MVP - replace with actual database queries
const mockSKUs: SKU[] = [
  {
    sku_id: 'SKU-001',
    product_name: 'Wireless Bluetooth Headphones',
    description: 'Premium noise-canceling wireless headphones',
    category_id: 'CAT-ELEC',
    category_name: 'Electronics',
    brand: 'AudioTech',
    manufacturer: 'AudioTech Inc.',
    weight_kg: 0.3,
    is_active: true,
    pricing: [
      {
        vendor_id: 'V-001',
        vendor_name: 'TechSupply Co',
        unit_price: 89.99,
        currency_code: 'USD',
        market_id: 'MKT-NORTHEAST',
        region_name: 'Northeast',
        stock_status: 'in_stock',
        last_updated: new Date().toISOString(),
      },
      {
        vendor_id: 'V-002',
        vendor_name: 'Global Electronics',
        unit_price: 94.50,
        currency_code: 'USD',
        market_id: 'MKT-WEST',
        region_name: 'West Coast',
        stock_status: 'in_stock',
        last_updated: new Date().toISOString(),
      },
    ],
  },
  {
    sku_id: 'SKU-002',
    product_name: 'Organic Green Tea - 100 Bags',
    description: 'Premium organic green tea from Japan',
    category_id: 'CAT-FOOD',
    category_name: 'Food & Beverage',
    brand: 'ZenTea',
    manufacturer: 'ZenTea Ltd.',
    weight_kg: 0.25,
    is_active: true,
    pricing: [
      {
        vendor_id: 'V-003',
        vendor_name: 'Natural Foods Dist',
        unit_price: 12.99,
        currency_code: 'USD',
        market_id: 'MKT-SOUTHEAST',
        region_name: 'Southeast',
        stock_status: 'in_stock',
        last_updated: new Date().toISOString(),
      },
    ],
  },
];

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);

    const query = {
      query: searchParams.get('query') || undefined,
      category: searchParams.get('category') || undefined,
      supplier: searchParams.get('supplier') || undefined,
      region: searchParams.get('region') || undefined,
      minPrice: searchParams.get('minPrice') ? parseFloat(searchParams.get('minPrice')!) : undefined,
      maxPrice: searchParams.get('maxPrice') ? parseFloat(searchParams.get('maxPrice')!) : undefined,
      page: parseInt(searchParams.get('page') || '1'),
      limit: parseInt(searchParams.get('limit') || '20'),
    };

    // Filter mock data based on query params
    let filteredSKUs = [...mockSKUs];

    if (query.query) {
      const searchLower = query.query.toLowerCase();
      filteredSKUs = filteredSKUs.filter(sku =>
        sku.product_name.toLowerCase().includes(searchLower) ||
        sku.sku_id.toLowerCase().includes(searchLower) ||
        sku.brand?.toLowerCase().includes(searchLower)
      );
    }

    if (query.category) {
      filteredSKUs = filteredSKUs.filter(sku =>
        sku.category_id === query.category ||
        sku.category_name?.toLowerCase().includes(query.category!.toLowerCase())
      );
    }

    if (query.supplier) {
      filteredSKUs = filteredSKUs.filter(sku =>
        sku.pricing?.some(p =>
          p.vendor_id === query.supplier ||
          p.vendor_name.toLowerCase().includes(query.supplier!.toLowerCase())
        )
      );
    }

    if (query.region) {
      filteredSKUs = filteredSKUs.filter(sku =>
        sku.pricing?.some(p =>
          p.market_id === query.region ||
          p.region_name?.toLowerCase().includes(query.region!.toLowerCase())
        )
      );
    }

    // Pagination
    const startIndex = (query.page - 1) * query.limit;
    const endIndex = startIndex + query.limit;
    const paginatedSKUs = filteredSKUs.slice(startIndex, endIndex);

    return NextResponse.json({
      success: true,
      data: paginatedSKUs,
      pagination: {
        page: query.page,
        limit: query.limit,
        total: filteredSKUs.length,
        totalPages: Math.ceil(filteredSKUs.length / query.limit),
      },
    });
  } catch (error) {
    console.error('Error fetching SKUs:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch SKUs' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // Validate input
    const validated = SKUSchema.omit({ pricing: true }).parse(body);

    // In production, save to database
    // For MVP, just return the created SKU
    const newSKU: SKU = {
      ...validated,
      sku_id: `SKU-${Date.now()}`,
      pricing: [],
    };

    return NextResponse.json({
      success: true,
      data: newSKU,
    }, { status: 201 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { success: false, error: 'Validation failed', details: error.errors },
        { status: 400 }
      );
    }
    console.error('Error creating SKU:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create SKU' },
      { status: 500 }
    );
  }
}
