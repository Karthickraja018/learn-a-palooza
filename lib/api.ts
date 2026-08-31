import type { PayloadProduct, PayloadCategory, PayloadService } from "@/types/payload";
import type { Product, Category } from "@/types";

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000';

function getMediaUrl(media: any): string {
  if (!media) return '';
  if (typeof media === 'string') return media;
  if (typeof media === 'number') return ''; // Unpopulated — not yet populated at this depth
  // Cloudinary: prefer cloudinaryUrl, fall back to url
  const url = media.cloudinaryUrl || media.url || '';
  if (url.startsWith('/')) {
    return `${API_URL}${url}`;
  }
  return url;
}

const SLUG_TO_ICON_NAME: Record<string, string> = {
  "hardness-testing": "Gauge",
  "universal-testing-machines": "ArrowUpDown",
  "sand-testing": "FlaskConical",
  "metrology": "Ruler",
  "ndt-equipment": "ScanSearch",
  "impact-testing": "Hammer",
  "civil-lab": "Building2",
  "microscopes": "Microscope",
  "cutting-tools": "Scissors",
  "projectors": "Projector",
};

export function mapCategory(payloadCategory: PayloadCategory, productCount = 0): Category {
  return {
    slug: payloadCategory.slug,
    name: payloadCategory.name,
    description: payloadCategory.description || '',
    icon: payloadCategory.icon || SLUG_TO_ICON_NAME[payloadCategory.slug] || 'Package',
    image: `/images/categories/${payloadCategory.slug}.png`,
    productCount,
  };
}

export function mapProduct(payloadProduct: PayloadProduct): Product {
  const category = payloadProduct.category;
  const categorySlug = typeof category === 'object' && category !== null ? category.slug : '';
  const categoryName = typeof category === 'object' && category !== null ? category.name : '';

  return {
    id: String(payloadProduct.id),
    name: payloadProduct.name,
    model: payloadProduct.modelCode || '',
    category: categoryName,
    categorySlug: categorySlug,
    slug: payloadProduct.slug,
    image: getMediaUrl(payloadProduct.heroImage),
    galleryImages: payloadProduct.galleryImages || [],
    shortDescription: payloadProduct.shortDescription || '',
    brand: payloadProduct.brand || '',
    series: payloadProduct.series || '',
    description: payloadProduct.description || '',
    isFeatured: !!(payloadProduct as any).isFeatured,
    features: payloadProduct.keyFeatures?.map((kf: any) => kf.feature) || [],
    specifications: payloadProduct.specTable?.reduce((acc: any, curr: any) => {
      acc[curr.label] = curr.value;
      return acc;
    }, {} as Record<string, string>) || {},
    applications: payloadProduct.applications ? payloadProduct.applications.split('\n').filter(Boolean) : [],
    standardsSupported: payloadProduct.standardsSupported?.map((s: any) => s.standard) || [],
    variants: (payloadProduct.variants as any[])?.map((v: any) => ({
      id: String(v.id),
      modelName: v.modelName || '',
      type: v.type || '',
      majorLoads: v.majorLoads || '',
      minorLoads: v.minorLoads || '',
      resolution: v.resolution || '',
      specifications: v.specTable?.reduce((acc: any, curr: any) => {
        acc[curr.label] = curr.value;
        return acc;
      }, {} as Record<string, string>) || {},
      shortDescription: v.shortDescription || '',
      features: v.features || [],
      standards: v.standards || [],
      images: v.images || [],
      accessories: v.accessories || [],
      downloadablePDF: v.downloadablePDF || null,
    })) || [],
    accessories: (payloadProduct.accessories as any[])?.map((a: any) => ({
      id: String(a.id),
      name: a.name || '',
      category: a.category || 'standard',
      description: a.description || '',
      image: getMediaUrl(a.image),
    })) || [],
    seo: {
      title: payloadProduct.metaTitle || '',
      description: payloadProduct.metaDescription || '',
      keywords: payloadProduct.metaKeywords || '',
      ogImage: getMediaUrl(payloadProduct.ogImage),
    },
  };
}

/**
 * Returns all categories that have at least one product, with accurate productCount.
 * Empty categories are excluded from the result.
 */
export async function getCategories(): Promise<Category[]> {
  try {
    // Fetch categories and all products in parallel
    const [catRes, prodRes] = await Promise.all([
      fetch(`${API_URL}/api/categories?depth=1&limit=100`, { next: { revalidate: 60 } }),
      fetch(`${API_URL}/api/products?depth=1&limit=500`, { next: { revalidate: 60 } }),
    ]);
    if (!catRes.ok) return [];

    const catData = await catRes.json();
    const categories: PayloadCategory[] = catData.docs;

    // Build a count map: categoryId -> count
    const countMap: Record<number, number> = {};
    if (prodRes.ok) {
      const prodData = await prodRes.json();
      for (const p of prodData.docs) {
        const catId = typeof p.category === 'object' && p.category !== null 
          ? p.category.id 
          : p.category;
        if (catId != null) countMap[catId] = (countMap[catId] || 0) + 1;
      }
    }

    // Map and filter out categories with 0 products
    const mappedCategories = categories
      .map((cat) => mapCategory(cat, countMap[cat.id] || 0))
      .filter((cat) => cat.productCount > 0);
      
    // Sort by sortOrder if available in the raw payload category
    mappedCategories.sort((a, b) => {
      const catA = categories.find(c => c.slug === a.slug);
      const catB = categories.find(c => c.slug === b.slug);
      const orderA = catA?.sortOrder ?? 999;
      const orderB = catB?.sortOrder ?? 999;
      return orderA - orderB;
    });

    return mappedCategories;
  } catch (error) {
    console.error('Error fetching categories:', error);
    return [];
  }
}

export async function getProducts(categorySlug?: string): Promise<Product[]> {
  try {
    const res = await fetch(`${API_URL}/api/products?depth=2&limit=100`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    let mapped: Product[] = data.docs.map(mapProduct);
    if (categorySlug) {
      mapped = mapped.filter((p) => p.categorySlug === categorySlug);
    }
    return mapped;
  } catch (error) {
    console.error('Error fetching products:', error);
    return [];
  }
}

/**
 * Returns products marked isFeatured=true, up to the given limit.
 * Falls back to the first `limit` products if none are featured.
 */
export async function getFeaturedProducts(limit = 6): Promise<Product[]> {
  try {
    // Try to fetch only featured products first
    const res = await fetch(
      `${API_URL}/api/products?where[isFeatured][equals]=true&depth=2&limit=${limit}`,
      { next: { revalidate: 60 } },
    );
    if (res.ok) {
      const data = await res.json();
      if (data.docs.length > 0) return data.docs.map(mapProduct);
    }
    // Fallback: return first `limit` products
    const fallbackRes = await fetch(`${API_URL}/api/products?depth=2&limit=${limit}`, { next: { revalidate: 60 } });
    if (!fallbackRes.ok) return [];
    const fallbackData = await fallbackRes.json();
    return fallbackData.docs.map(mapProduct);
  } catch (error) {
    console.error('Error fetching featured products:', error);
    return [];
  }
}

export async function getProductBySlug(slug: string): Promise<Product | null> {
  try {
    const res = await fetch(`${API_URL}/api/products?where[slug][equals]=${slug}&depth=2`, { next: { revalidate: 60 } });
    if (!res.ok) return null;
    const data = await res.json();
    if (data.docs.length === 0) return null;
    return mapProduct(data.docs[0]);
  } catch (error) {
    console.error('Error fetching product by slug:', error);
    return null;
  }
}

export async function getServices(): Promise<PayloadService[]> {
  try {
    const res = await fetch(`${API_URL}/api/services?depth=1&limit=100`, { next: { revalidate: 60 } });
    if (!res.ok) return [];
    const data = await res.json();
    return data.docs;
  } catch (error) {
    console.error('Error fetching services:', error);
    return [];
  }
}
