/**
 * Translator - MyMemory Translation API handler
 * Free API, supports EN/KO/ZH → VI
 * Includes caching & debouncing
 */

export class Translator {
  constructor() {
    this.cache = new Map();
    this.pendingRequests = new Map();
    this.langMap = {
      'en-US': 'en',
      'ko-KR': 'ko',
      'zh-CN': 'zh-CN'
    };
  }

  _getCacheKey(text, srcLang) {
    return `${srcLang}:${text}`;
  }

  async translate(text, srcLangCode) {
    if (!text || text.trim().length === 0) return '';

    const srcLang = this.langMap[srcLangCode] || 'en';
    const cacheKey = this._getCacheKey(text, srcLang);

    // Check cache
    if (this.cache.has(cacheKey)) {
      return this.cache.get(cacheKey);
    }

    // Check if same request is already pending
    if (this.pendingRequests.has(cacheKey)) {
      return this.pendingRequests.get(cacheKey);
    }

    const promise = this._fetchTranslation(text, srcLang, cacheKey);
    this.pendingRequests.set(cacheKey, promise);

    try {
      const result = await promise;
      return result;
    } finally {
      this.pendingRequests.delete(cacheKey);
    }
  }

  async _fetchTranslation(text, srcLang, cacheKey) {
    // Chuyển đổi mã ngôn ngữ sang chuẩn mà Google Dịch hỗ trợ
    let googleSrcLang = srcLang;
    if (srcLang.startsWith('zh')) googleSrcLang = 'zh-CN';
    else if (srcLang.startsWith('ko')) googleSrcLang = 'ko';
    else if (srcLang.startsWith('en')) googleSrcLang = 'en';

    // Sử dụng Google Translate unofficial API (Hoàn toàn miễn phí, không giới hạn limit, chất lượng cao)
    const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${encodeURIComponent(googleSrcLang)}&tl=vi&dt=t&q=${encodeURIComponent(text)}`;

    try {
      const response = await fetch(url);

      if (!response.ok) {
        throw new Error(`Translation API error: ${response.status}`);
      }

      const data = await response.json();

      // Kết quả của Google trả ra dưới dạng nhiều mảng lồng nhau
      if (data && data[0] && Array.isArray(data[0])) {
        // Nội dung dịch nằm ở index 0 của mỗi mảng con, nên nối lại
        let translated = data[0].map(item => item[0]).join('');
        
        this.cache.set(cacheKey, translated);
        return translated;
      }

      return `[Không thể dịch] ${text}`;
    } catch (error) {
      console.error('Translation error:', error);
      return `[Lỗi dịch] ${text}`;
    }
  }

  async translateBatch(segments, srcLangCode) {
    const results = [];
    // Process in small batches to avoid rate limiting
    const batchSize = 3;

    for (let i = 0; i < segments.length; i += batchSize) {
      const batch = segments.slice(i, i + batchSize);
      const batchResults = await Promise.all(
        batch.map(seg => this.translate(seg.text, srcLangCode))
      );
      results.push(...batchResults);
    }

    return results;
  }

  clearCache() {
    this.cache.clear();
  }
}
