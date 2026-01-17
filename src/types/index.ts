import { z } from 'zod';

export interface Product {
  id?: string;
  title: string;
  price: number;
  originalPrice?: number;
  stockStatus?: "in_stock" | "low_stock" | "out_of_stock" | "unknown";
  retailer: string; // mapped to retailer_id in DB
  url: string;
  imageUrl?: string;
  category?: string;
  retailerSku?: string;
  scrapedAt: string | Date;
  description?: string;
}

export const ProductSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  price: z.number(),
  originalPrice: z.number().optional(),
  stockStatus: z.enum(["in_stock", "low_stock", "out_of_stock", "unknown"]).optional(),
  retailer: z.string(),
  url: z.string(),
  imageUrl: z.string().optional(),
  category: z.string().optional(),
  retailerSku: z.string().optional(),
  scrapedAt: z.union([z.string(), z.date()]),
  description: z.string().optional(),
});

export interface PricingAnomaly {
  id: string;
  productId: string;
  product?: Product;
  anomalyType: "z_score" | "percentage_drop" | "decimal_error" | "historical" | "mad_score" | "iqr_outlier";
  zScore?: number;
  discountPercentage: number;
  initialConfidence: number;
  detectedAt: string;
  status: "pending" | "validated" | "rejected" | "notified";
}

export const PricingAnomalySchema = z.object({
  id: z.string(),
  productId: z.string(),
  product: ProductSchema.optional(),
  anomalyType: z.enum(["z_score", "percentage_drop", "decimal_error", "historical", "mad_score", "iqr_outlier"]),
  zScore: z.number().optional(),
  discountPercentage: z.number(),
  initialConfidence: z.number(),
  detectedAt: z.string(),
  status: z.enum(["pending", "validated", "rejected", "notified"]),
});

export interface ValidatedGlitch {
  id: string;
  anomalyId: string;
  productId: string;
  product: Product; // Included via relation
  isGlitch: boolean;
  confidence: number;
  reasoning: string;
  glitchType:
    | "decimal_error"
    | "database_error"
    | "clearance"
    | "coupon_stack"
    | "unknown";
  profitMargin: number;
  estimatedDuration?: string;
  validatedAt: string;
}

export const ValidatedGlitchSchema = z.object({
  id: z.string(),
  anomalyId: z.string(),
  productId: z.string(),
  product: ProductSchema,
  isGlitch: z.boolean(),
  confidence: z.number(),
  reasoning: z.string(),
  glitchType: z.enum(["decimal_error", "database_error", "clearance", "coupon_stack", "unknown"]),
  profitMargin: z.number(),
  estimatedDuration: z.string().optional(),
  validatedAt: z.string(),
});

export interface ScrapingJob {
  id?: string;
  url: string;
  retailer: string;
  category: string;
}

export interface ProductData {
  title: string;
  price: number;
  originalPrice?: number;
  url: string;
  imageUrl?: string;
  scrapedAt: string;
}

export interface DetectResult {
  is_anomaly: boolean;
  anomaly_type?: 'z_score' | 'percentage_drop' | 'decimal_error' | 'mad_score' | 'iqr_outlier';
  z_score: number;
  discount_percentage: number;
  confidence: number;
  // NEW FIELDS for A/B testing
  mad_score: number;         // Double MAD score
  iqr_flag: boolean;         // Whether price is outside adjusted IQR bounds
}

export interface ValidationResult {
  is_glitch: boolean;
  confidence: number;
  reasoning: string;
  glitch_type: "decimal_error" | "database_error" | "clearance" | "coupon_stack" | "unknown";
}

export interface ScrapeResult {
  success: boolean;
  data?: Record<string, unknown>; // Replacing any with Record<string, unknown>
  error?: string;
  product?: Product;
  anomaly?: PricingAnomaly | Partial<PricingAnomaly>; // Simplified type
}

// Notification Types

export interface NotificationResult {
  success: boolean;
  channel?: string;
  error?: string;
  messageId?: string;
  sentAt?: string;
}

export interface NotificationProvider {
  send(glitch: ValidatedGlitch, target?: string): Promise<NotificationResult>;
}

export interface Notification {
  id: string;
  glitch_id: string;
  channel: string;
  message: Record<string, unknown>;
  status: string;
  created_at: string;
  delivered_at?: string;
}
