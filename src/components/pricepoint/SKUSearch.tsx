'use client';

import React, { useState, useEffect, useCallback } from 'react';

interface SKUPricing {
  vendor_id: string;
  vendor_name: string;
  unit_price: number;
  currency_code: string;
  market_id: string | null;
  region_name: string | null;
  stock_status: string;
  last_updated: string;
}

interface SKU {
  sku_id: string;
  product_name: string;
  description: string | null;
  category_id: string | null;
  category_name: string | null;
  brand: string | null;
  manufacturer: string | null;
  weight_kg: number | null;
  is_active: boolean;
  pricing?: SKUPricing[];
}

interface SearchFilters {
  query: string;
  category: string;
  supplier: string;
  region: string;
}

interface SKUSearchProps {
  onSKUSelect?: (sku: SKU) => void;
}

export default function SKUSearch({ onSKUSelect }: SKUSearchProps) {
  const [skus, setSKUs] = useState<SKU[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<SearchFilters>({
    query: '',
    category: '',
    supplier: '',
    region: '',
  });
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 20,
    total: 0,
    totalPages: 0,
  });

  const fetchSKUs = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (filters.query) params.set('query', filters.query);
      if (filters.category) params.set('category', filters.category);
      if (filters.supplier) params.set('supplier', filters.supplier);
      if (filters.region) params.set('region', filters.region);
      params.set('page', pagination.page.toString());
      params.set('limit', pagination.limit.toString());

      const response = await fetch(`/api/pricepoint/skus?${params}`);
      const data = await response.json();

      if (data.success) {
        setSKUs(data.data);
        setPagination(prev => ({
          ...prev,
          total: data.pagination.total,
          totalPages: data.pagination.totalPages,
        }));
      } else {
        setError(data.error || 'Failed to fetch SKUs');
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [filters, pagination.page, pagination.limit]);

  useEffect(() => {
    const debounceTimer = setTimeout(fetchSKUs, 300);
    return () => clearTimeout(debounceTimer);
  }, [fetchSKUs]);

  const handleFilterChange = (field: keyof SearchFilters, value: string) => {
    setFilters(prev => ({ ...prev, [field]: value }));
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const getStockStatusColor = (status: string) => {
    switch (status) {
      case 'in_stock':
        return 'bg-green-100 text-green-800';
      case 'low_stock':
        return 'bg-yellow-100 text-yellow-800';
      case 'out_of_stock':
        return 'bg-red-100 text-red-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const formatPrice = (price: number, currency: string) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: currency,
    }).format(price);
  };

  return (
    <div className="bg-white rounded-lg shadow-md p-6">
      <h2 className="text-2xl font-bold text-gray-800 mb-6">SKU Search</h2>

      {/* Search Filters */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Search
          </label>
          <input
            type="text"
            placeholder="SKU, product name, brand..."
            value={filters.query}
            onChange={(e) => handleFilterChange('query', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Category
          </label>
          <select
            value={filters.category}
            onChange={(e) => handleFilterChange('category', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Categories</option>
            <option value="Electronics">Electronics</option>
            <option value="Food & Beverage">Food & Beverage</option>
            <option value="Home & Garden">Home & Garden</option>
            <option value="Health & Beauty">Health & Beauty</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Supplier
          </label>
          <select
            value={filters.supplier}
            onChange={(e) => handleFilterChange('supplier', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Suppliers</option>
            <option value="V-001">TechSupply Co</option>
            <option value="V-002">Global Electronics</option>
            <option value="V-003">Natural Foods Dist</option>
          </select>
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">
            Region
          </label>
          <select
            value={filters.region}
            onChange={(e) => handleFilterChange('region', e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="">All Regions</option>
            <option value="Northeast">Northeast</option>
            <option value="Southeast">Southeast</option>
            <option value="Midwest">Midwest</option>
            <option value="West Coast">West Coast</option>
          </select>
        </div>
      </div>

      {/* Results */}
      {error && (
        <div className="bg-red-50 text-red-700 p-4 rounded-md mb-4">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center items-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
        </div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    SKU / Product
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Category
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Brand
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Pricing
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {skus.map((sku) => (
                  <tr
                    key={sku.sku_id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() => onSKUSelect?.(sku)}
                  >
                    <td className="px-6 py-4">
                      <div className="text-sm font-medium text-gray-900">
                        {sku.product_name}
                      </div>
                      <div className="text-sm text-gray-500">{sku.sku_id}</div>
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {sku.category_name || '-'}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500">
                      {sku.brand || '-'}
                    </td>
                    <td className="px-6 py-4">
                      {sku.pricing && sku.pricing.length > 0 ? (
                        <div className="space-y-1">
                          {sku.pricing.slice(0, 2).map((p, idx) => (
                            <div key={idx} className="text-sm">
                              <span className="font-medium text-gray-900">
                                {formatPrice(p.unit_price, p.currency_code)}
                              </span>
                              <span className="text-gray-500 ml-2">
                                {p.vendor_name}
                              </span>
                            </div>
                          ))}
                          {sku.pricing.length > 2 && (
                            <div className="text-xs text-blue-600">
                              +{sku.pricing.length - 2} more vendors
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-gray-400">No pricing data</span>
                      )}
                    </td>
                    <td className="px-6 py-4">
                      {sku.pricing && sku.pricing.length > 0 && (
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStockStatusColor(
                            sku.pricing[0].stock_status
                          )}`}
                        >
                          {sku.pricing[0].stock_status.replace('_', ' ')}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-gray-700">
              Showing {skus.length} of {pagination.total} results
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={pagination.page === 1}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Previous
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                Page {pagination.page} of {pagination.totalPages || 1}
              </span>
              <button
                onClick={() => setPagination(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={pagination.page >= pagination.totalPages}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Next
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
