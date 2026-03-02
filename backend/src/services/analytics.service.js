import { supabase } from '../config/supabase.js';

/**
 * Service pour gérer les analytics des blogs
 */

// Créer ou mettre à jour les analytics d'un blog pour une date donnée
export async function upsertBlogAnalytics(blogId, date, analyticsData) {
  const { data, error } = await supabase
    .from('blog_analytics')
    .upsert({
      blog_id: blogId,
      date: date,
      page_views: analyticsData.pageViews || 0,
      unique_visitors: analyticsData.uniqueVisitors || 0,
      avg_time_on_page: analyticsData.avgTimeOnPage || null,
      bounce_rate: analyticsData.bounceRate || null,
      google_position: analyticsData.googlePosition || null,
      impressions: analyticsData.impressions || 0,
      clicks: analyticsData.clicks || 0,
      ctr: analyticsData.ctr || null,
      scroll_depth: analyticsData.scrollDepth || null,
      conversions: analyticsData.conversions || 0,
      raw_analytics_data: analyticsData.rawData || null,
    }, { onConflict: 'blog_id,date' })
    .select()
    .single();

  if (error) throw new Error(`Erreur sauvegarde analytics: ${error.message}`);
  return data;
}

// Récupérer les analytics d'un blog
export async function getBlogAnalytics(blogId, options = {}) {
  let query = supabase
    .from('blog_analytics')
    .select('*')
    .eq('blog_id', blogId);

  if (options.startDate) {
    query = query.gte('date', options.startDate);
  }

  if (options.endDate) {
    query = query.lte('date', options.endDate);
  }

  const { data, error } = await query.order('date', { ascending: false });

  if (error) throw new Error(`Erreur récupération analytics: ${error.message}`);
  return data;
}

// Récupérer les analytics agrégées pour un blog
export async function getAggregatedAnalytics(blogId) {
  const { data, error } = await supabase
    .rpc('get_blog_aggregate_analytics', { blog_id_param: blogId });

  // Si la fonction RPC n'existe pas encore, faire l'agrégation côté app
  if (error) {
    const { data: analytics, error: fetchError } = await supabase
      .from('blog_analytics')
      .select('*')
      .eq('blog_id', blogId);

    if (fetchError) throw new Error(`Erreur récupération analytics: ${fetchError.message}`);

    if (!analytics || analytics.length === 0) {
      return {
        totalPageViews: 0,
        totalClicks: 0,
        avgGooglePosition: null,
        avgCtr: 0,
        avgBounceRate: 0,
      };
    }

    const totals = analytics.reduce((acc, curr) => {
      acc.pageViews += curr.page_views || 0;
      acc.clicks += curr.clicks || 0;
      acc.positions.push(curr.google_position);
      acc.ctrs.push(curr.ctr);
      acc.bounceRates.push(curr.bounce_rate);
      return acc;
    }, { pageViews: 0, clicks: 0, positions: [], ctrs: [], bounceRates: [] });

    const validPositions = totals.positions.filter(p => p !== null);
    const validCtrs = totals.ctrs.filter(c => c !== null);
    const validBounceRates = totals.bounceRates.filter(b => b !== null);

    return {
      totalPageViews: totals.pageViews,
      totalClicks: totals.clicks,
      avgGooglePosition: validPositions.length > 0 
        ? validPositions.reduce((a, b) => a + b, 0) / validPositions.length 
        : null,
      avgCtr: validCtrs.length > 0 
        ? validCtrs.reduce((a, b) => a + b, 0) / validCtrs.length 
        : 0,
      avgBounceRate: validBounceRates.length > 0 
        ? validBounceRates.reduce((a, b) => a + b, 0) / validBounceRates.length 
        : 0,
    };
  }

  return data;
}

// Récupérer les blogs les plus performants d'un site
export async function getTopPerformingBlogs(siteId, limit = 10) {
  const { data, error } = await supabase
    .from('blogs')
    .select(`
      id,
      title,
      h1,
      theme,
      tone,
      main_keyword_id,
      created_at,
      blog_analytics (
        clicks,
        page_views,
        google_position,
        ctr
      )
    `)
    .eq('site_id', siteId)
    .eq('status', 'published');

  if (error) throw new Error(`Erreur récupération top blogs: ${error.message}`);

  // Calculer le score de performance pour chaque blog
  const blogsWithScores = data.map(blog => {
    const analytics = blog.blog_analytics || [];
    const totalClicks = analytics.reduce((sum, a) => sum + (a.clicks || 0), 0);
    const totalPageViews = analytics.reduce((sum, a) => sum + (a.page_views || 0), 0);
    const avgPosition = analytics.length > 0
      ? analytics.reduce((sum, a) => sum + (a.google_position || 100), 0) / analytics.length
      : 100;
    const avgCtr = analytics.length > 0
      ? analytics.reduce((sum, a) => sum + (a.ctr || 0), 0) / analytics.length
      : 0;

    // Score composite
    const performanceScore = (totalClicks * 10) + (100 - avgPosition) * 2 + (avgCtr * 100);

    return {
      ...blog,
      totalClicks,
      totalPageViews,
      avgPosition,
      avgCtr,
      performanceScore,
    };
  });

  // Trier par score et limiter
  return blogsWithScores
    .sort((a, b) => b.performanceScore - a.performanceScore)
    .slice(0, limit);
}

// Identifier et sauvegarder les patterns des blogs performants
export async function identifySuccessfulPatterns(blogId) {
  // Récupérer le blog et ses analytics
  const { data: blog, error: blogError } = await supabase
    .from('blogs')
    .select(`
      *,
      blog_analytics (*)
    `)
    .eq('id', blogId)
    .single();

  if (blogError) throw new Error(`Erreur récupération blog: ${blogError.message}`);

  const analytics = blog.blog_analytics || [];
  const totalClicks = analytics.reduce((sum, a) => sum + (a.clicks || 0), 0);
  const avgPosition = analytics.length > 0
    ? analytics.reduce((sum, a) => sum + (a.google_position || 100), 0) / analytics.length
    : 100;

  // Calculer le score de performance
  const performanceScore = (totalClicks * 10) + (100 - avgPosition) * 2;

  // Si le blog est performant (score > 50), extraire les patterns
  if (performanceScore > 50) {
    const patterns = [
      {
        blog_id: blogId,
        pattern_type: 'tone',
        pattern_data: { tone: blog.tone },
        performance_score: performanceScore,
      },
      {
        blog_id: blogId,
        pattern_type: 'structure',
        pattern_data: {
          hasIntroduction: !!blog.introduction,
          bodyLength: blog.body?.length || 0,
          theme: blog.theme,
        },
        performance_score: performanceScore,
      },
      {
        blog_id: blogId,
        pattern_type: 'keyword_usage',
        pattern_data: {
          mainKeywordId: blog.main_keyword_id,
          secondaryKeywordsCount: blog.secondary_keywords_used?.length || 0,
        },
        performance_score: performanceScore,
      },
    ];

    const { data, error } = await supabase
      .from('successful_patterns')
      .upsert(patterns, { onConflict: 'blog_id,pattern_type' })
      .select();

    if (error) throw new Error(`Erreur sauvegarde patterns: ${error.message}`);
    return data;
  }

  return [];
}

// Récupérer les patterns les plus performants pour un site
export async function getTopPatterns(siteId, patternType = null, limit = 10) {
  // Récupérer les blogs du site
  const { data: blogs, error: blogsError } = await supabase
    .from('blogs')
    .select('id')
    .eq('site_id', siteId);

  if (blogsError) throw new Error(`Erreur récupération blogs: ${blogsError.message}`);

  const blogIds = blogs.map(b => b.id);

  let query = supabase
    .from('successful_patterns')
    .select('*')
    .in('blog_id', blogIds);

  if (patternType) {
    query = query.eq('pattern_type', patternType);
  }

  const { data, error } = await query
    .order('performance_score', { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Erreur récupération patterns: ${error.message}`);
  return data;
}
