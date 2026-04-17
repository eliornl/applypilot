/**
 * ApplyPilot — page extraction (injected into the active tab).
 * Priority: user selection → schema.org JobPosting (JSON-LD) → site connectors → generic DOM heuristics.
 * Assigned on window so chrome.scripting.executeScript can invoke it after this file loads.
 */
(function registerJaaExtract() {
  'use strict';

  var MIN_SELECTION_CHARS = 100;
  var MIN_CANDIDATE_CHARS = 120;
  /** Minimum formatted size to prefer JSON-LD over DOM (many ATS pages embed full description here). */
  var MIN_JSON_LD_CHARS = 180;
  var MAX_EXTRACT_CHARS = 50000;

  /**
   * Hostname → extra root selectors for known career sites / ATS boards.
   * Maintained as URLs/DOM change; fall back to generic scoring if no match.
   */
  var SITE_CONNECTOR_ROOTS = [
    { re: /^boards\.greenhouse\.io$/i, selectors: ['#app_body', '[class*="job__description"]', 'main'] },
    { re: /^jobs\.lever\.co$/i, selectors: ['.posting', '.content', 'main'] },
    { re: /^jobs\.ashbyhq\.com$/i, selectors: ['main', '[class*="ashby"]', '[class*="JobPosting"]'] },
    { re: /(^|\.)myworkdayjobs\.com$/i, selectors: ['[data-automation-id="jobPostingDescription"]', '[data-automation-id="richTextArea"]', 'main'] },
    { re: /^(www\.)?indeed\.com$/i, selectors: ['#jobDescriptionText', '[data-testid="job-description"]', '[id*="jobDescription"]'] },
    { re: /^(www\.)?glassdoor\.com$/i, selectors: ['[data-test="jobDescription"]', '[class*="JobDescription"]', 'main'] },
    { re: /^(www\.)?ziprecruiter\.com$/i, selectors: ['[data-test-id="job-description"]', 'article', 'main'] },
    { re: /^(www\.)?monster\.com$/i, selectors: ['[data-testid="job-description"]', '#JobDescription', 'main'] },
    { re: /^(www\.)?careerbuilder\.com$/i, selectors: ['[data-testid="job-description"]', '.job-description', 'main'] }
  ];

  var JOB_KEYWORDS = [
    'responsibilit',
    'requirement',
    'qualification',
    'job description',
    'about the role',
    'about the position',
    'about this role',
    'what you',
    'what we',
    'experience',
    'skills',
    'benefits',
    'compensation',
    'salary',
    'apply',
    'full-time',
    'part-time',
    'remote',
    'hybrid'
  ];

  function addHostnameHints(host, path, add) {
    if (!/linkedin\.(com|cn)$/i.test(host || '') || !/\/jobs/i.test(path || '')) {
      return;
    }
    [
      '.jobs-search__job-details-body',
      '.jobs-details__main-content',
      'article.jobs-description__container'
    ].forEach(function trySel(sel) {
      try {
        document.querySelectorAll(sel).forEach(add);
      } catch (e) {
        /* skip invalid selector in old browsers */
      }
    });
  }

  function addSiteConnectorRoots(host, add) {
    if (!host) return;
    var i;
    var j;
    for (i = 0; i < SITE_CONNECTOR_ROOTS.length; i++) {
      var row = SITE_CONNECTOR_ROOTS[i];
      if (!row.re.test(host)) continue;
      for (j = 0; j < row.selectors.length; j++) {
        try {
          document.querySelectorAll(row.selectors[j]).forEach(add);
        } catch (e) {
          /* invalid selector */
        }
      }
    }
  }

  function htmlToPlainText(html) {
    if (!html) return '';
    var s = String(html);
    try {
      var d = document.createElement('div');
      d.innerHTML = s;
      return (d.innerText || d.textContent || '').trim();
    } catch (e) {
      return s.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    }
  }

  function isJobPostingType(o) {
    if (!o || typeof o !== 'object') return false;
    var ty = o['@type'];
    if (!ty) return false;
    if (Array.isArray(ty)) {
      return ty.some(function (t) {
        return /JobPosting/i.test(String(t));
      });
    }
    return /JobPosting/i.test(String(ty));
  }

  function collectJobPostingObjects(node, out) {
    if (!node) return;
    if (Array.isArray(node)) {
      var i;
      for (i = 0; i < node.length; i++) collectJobPostingObjects(node[i], out);
      return;
    }
    if (typeof node !== 'object') return;
    if (isJobPostingType(node)) out.push(node);
    if (node['@graph']) collectJobPostingObjects(node['@graph'], out);
    var k;
    for (k in node) {
      if (!Object.prototype.hasOwnProperty.call(node, k)) continue;
      if (k === '@context' || k === '@id') continue;
      var v = node[k];
      if (v && typeof v === 'object') collectJobPostingObjects(v, out);
    }
  }

  function formatOneJobPosting(job) {
    var lines = [];
    if (job.title) lines.push(String(job.title).trim());
    var org = job.hiringOrganization;
    if (org) {
      if (typeof org === 'object' && org.name) lines.push('Company: ' + String(org.name).trim());
      else if (typeof org === 'string') lines.push('Company: ' + org.trim());
    }
    if (job.datePosted) lines.push('Posted: ' + String(job.datePosted));
    if (job.employmentType) {
      var et = job.employmentType;
      lines.push('Employment: ' + (Array.isArray(et) ? et.join(', ') : String(et)));
    }
    if (job.industry) lines.push('Industry: ' + String(job.industry));
    var jl = job.jobLocation;
    if (jl) {
      var locStr = '';
      if (typeof jl === 'object') {
        if (jl.address && typeof jl.address === 'object') {
          var a = jl.address;
          locStr = [a.addressLocality, a.addressRegion, a.addressCountry].filter(Boolean).join(', ');
        } else if (jl.address && typeof jl.address === 'string') {
          locStr = jl.address;
        } else {
          locStr = jl.name || jl.description || '';
        }
      } else {
        locStr = String(jl);
      }
      if (locStr) lines.push('Location: ' + locStr.trim());
    }
    if (job.baseSalary) {
      var bs = job.baseSalary;
      if (typeof bs === 'object' && bs.value) {
        lines.push('Salary: ' + String(bs.value) + (bs.currency ? ' ' + bs.currency : ''));
      }
    }
    if (job.skills) {
      var sk = job.skills;
      if (typeof sk === 'string') {
        lines.push('Skills: ' + sk.trim());
      } else if (Array.isArray(sk)) {
        var names = sk
          .map(function (s) {
            return typeof s === 'object' && s && s.name ? s.name : String(s);
          })
          .filter(Boolean);
        if (names.length) lines.push('Skills: ' + names.join(', '));
      }
    }
    if (job.description) {
      lines.push('');
      lines.push(htmlToPlainText(String(job.description)));
    }
    return lines.join('\n').trim();
  }

  function extractJobPostingFromJsonLd() {
    var scripts = document.querySelectorAll('script[type="application/ld+json"]');
    var postings = [];
    var si;
    for (si = 0; si < scripts.length; si++) {
      try {
        var data = JSON.parse(scripts[si].textContent);
        collectJobPostingObjects(data, postings);
      } catch (e) {
        /* invalid JSON */
      }
    }
    if (postings.length === 0) return '';
    var best = '';
    var pi;
    for (pi = 0; pi < postings.length; pi++) {
      var formatted = formatOneJobPosting(postings[pi]);
      if (formatted.length > best.length) best = formatted;
    }
    return cleanText(best);
  }

  function capContent(s) {
    if (!s) return '';
    return s.length > MAX_EXTRACT_CHARS ? s.substring(0, MAX_EXTRACT_CHARS) : s;
  }

  function normalizeWs(t) {
    return (t || '').replace(/\s+/g, ' ').trim();
  }

  /** True if DOM text already contains the structured LD snippet (avoid duplicate blocks). */
  function isDomSupersetOfLd(ld, dom) {
    if (!ld || !dom || ld.length < 40) return false;
    var sample = normalizeWs(ld).substring(0, 140);
    if (sample.length < 40) return false;
    return normalizeWs(dom).indexOf(sample) !== -1;
  }

  function getMetaJobDescription() {
    var og = document.querySelector('meta[property="og:description"]');
    if (og) {
      var c = og.getAttribute('content');
      if (c && c.trim()) return c.trim();
    }
    var tw = document.querySelector('meta[name="twitter:description"]');
    if (tw) {
      var t = tw.getAttribute('content');
      if (t && t.trim()) return t.trim();
    }
    var d = document.querySelector('meta[name="description"]');
    if (d) {
      var m = d.getAttribute('content');
      if (m && m.trim()) return m.trim();
    }
    return '';
  }

  function maybeAppendMetaDescription(content) {
    if (!content || content.length >= 280) return content;
    var meta = getMetaJobDescription();
    if (meta.length < 50) return content;
    var n1 = normalizeWs(content).toLowerCase();
    var n2 = normalizeWs(meta).toLowerCase();
    if (n1.indexOf(n2.substring(0, Math.min(80, n2.length))) !== -1) return content;
    return capContent(content + '\n\n---\n\n' + meta);
  }

  function buildDomExtractedText() {
    var rootEl = pickBestContentRoot();
    var bodyClone = rootEl.cloneNode(true);
    removeSplitViewListRails(bodyClone);
    removeUnwantedElements(bodyClone);
    var text = cleanText(bodyClone.innerText || bodyClone.textContent || '');
    text = text.replace(/\{"[^}]{500,}\}/g, '');
    text = text.replace(/\[[^\]]{500,}\]/g, '');
    return capContent(text);
  }

  /**
   * Split job-search UIs: left column = compact cards (often wrong company if we "win" that node).
   * `/jobs/collections/*` uses different wrappers than `/jobs/search` — include list/card patterns.
   */
  function isInsideSearchResultsRail(el) {
    if (!el || !el.closest) return false;
    if (el.closest('[class*="jobs-search-results"]')) return true;
    if (el.closest('[class*="search-results__list-item"]')) return true;
    if (el.closest('[class*="scaffold-layout__list"]')) return true;
    if (el.closest('[class*="jobs-feed-card-list"]')) return true;
    if (el.closest('[class*="job-card-list"]')) return true;
    /* LinkedIn collections / recommended left column rows (not the open job pane) */
    if (el.closest('[class*="reusable-search__result-container"]')) return true;
    return false;
  }

  /**
   * Compact list rows (e.g. a card in the left rail) use job-card-* classes; the open posting is in the right rail.
   */
  function isInsideCompactListJobCard(el) {
    if (!el || !el.closest) return false;
    if (el.closest('[class*="jobs-search__right-rail"]')) return false;
    if (el.closest('[class*="jobs-search__job-details--wrapper"]')) return false;
    if (el.closest('[class*="jobs-unified-top-card"]')) return false;
    if (el.closest('[class*="job-card-container"]')) return true;
    if (el.closest('[class*="job-card-list__"]')) return true;
    return false;
  }

  function isLinkedInJobsPage() {
    return /linkedin\.(com|cn)$/i.test(window.location.hostname || '') && /\/jobs/i.test(window.location.pathname || '');
  }

  /**
   * LinkedIn often embeds multiple JobPosting blobs or a feed — the first/longest is not the focused job.
   * DOM + layout is more reliable on /jobs (especially with currentJobId in the URL).
   */
  function shouldSkipJsonLdForLinkedInJobs() {
    return isLinkedInJobsPage();
  }

  /**
   * Split view: the open job description is in the right column — highest getBoundingClientRect().left wins.
   * When `requireJobIdMatch` is true (URL has currentJobId), only consider nodes whose HTML references that posting.
   */
  function getLinkedInRightmostDetailBody(requireJobIdMatch) {
    if (!isLinkedInJobsPage()) return null;
    var jid = linkedInUrlJobId();
    var needles = jid ? linkedInJobPostingNeedles(jid) : [];
    var mustMatch = !!requireJobIdMatch && needles.length > 0;
    var selectors = [
      '.jobs-search__job-details-body',
      'article.jobs-description__container',
      '[class*="jobs-details__main-content"]',
      '[class*="job-details-body"]'
    ];
    var best = null;
    var bestLeft = -Infinity;
    var si;
    var nodes;
    var ni;
    var el;
    var t;
    var rect;
    var blob;
    for (si = 0; si < selectors.length; si++) {
      try {
        nodes = document.querySelectorAll(selectors[si]);
      } catch (e) {
        nodes = [];
      }
      for (ni = 0; ni < nodes.length; ni++) {
        el = nodes[ni];
        if (isInsideSearchResultsRail(el) || isInsideCompactListJobCard(el)) continue;
        blob = (el.innerHTML || '') + (el.outerHTML || '').slice(0, 80000);
        if (mustMatch && !blobMatchesLinkedInJobNeedles(blob, needles)) continue;
        t = (el.innerText || '').trim();
        if (t.length < MIN_CANDIDATE_CHARS) continue;
        try {
          rect = el.getBoundingClientRect();
        } catch (e2) {
          continue;
        }
        if (rect.width < 40 || rect.height < 40) continue;
        if (rect.left > bestLeft) {
          bestLeft = rect.left;
          best = el;
        }
      }
    }
    return best;
  }

  /**
   * Prefer the real job-detail body (right pane). When URL has currentJobId, boost nodes that
   * reference it so we never "win" the longest list-card article (e.g. first row = wrong company).
   */
  function getLinkedInAnchoredDetailRoot() {
    if (!isLinkedInJobsPage()) return null;
    var jid = linkedInUrlJobId();
    var detailSelectors = [
      '.jobs-search__job-details-body',
      'article.jobs-description__container',
      '[class*="jobs-details__main-content"]',
      '[class*="job-details-body"]'
    ];
    var scored = [];
    var si;
    var nodes;
    var ni;
    var el;
    var t;
    var blob;
    for (si = 0; si < detailSelectors.length; si++) {
      try {
        nodes = document.querySelectorAll(detailSelectors[si]);
      } catch (e) {
        nodes = [];
      }
      for (ni = 0; ni < nodes.length; ni++) {
        el = nodes[ni];
        if (isInsideSearchResultsRail(el) || isInsideCompactListJobCard(el)) continue;
        t = (el.innerText || '').trim();
        if (t.length < MIN_CANDIDATE_CHARS) continue;
        blob = (el.innerHTML || '') + (el.outerHTML || '').slice(0, 60000) + t;
        var score = t.length;
        if (jid && blobMatchesLinkedInJobNeedles(blob, linkedInJobPostingNeedles(jid))) {
          score += 80000;
        }
        scored.push({ el: el, score: score });
      }
    }
    if (scored.length === 0) return null;
    scored.sort(function (a, b) {
      return b.score - a.score;
    });
    return scored[0].el;
  }

  /**
   * LinkedIn: the selected job copy lives in the right column — NOT in the scrollable card list.
   * Use querySelectorAll + longest match so the first DOM match is never a false-positive rail.
   */
  function getLinkedInOpenJobPaneRoot() {
    if (!isLinkedInJobsPage()) return null;

    var jid = linkedInUrlJobId();
    var needles = linkedInJobPostingNeedles(jid || '');

    function bestByTextLength(selectors, preferMatchingJobIdInBlob) {
      var best = null;
      var bestLen = 0;
      var si;
      var nodes;
      var ni;
      var r;
      var txt;
      var blob;
      for (si = 0; si < selectors.length; si++) {
        try {
          nodes = document.querySelectorAll(selectors[si]);
        } catch (e) {
          nodes = [];
        }
        for (ni = 0; ni < nodes.length; ni++) {
          r = nodes[ni];
          if (!r || isInsideSearchResultsRail(r) || isInsideCompactListJobCard(r)) continue;
          blob = (r.innerHTML || '') + (r.innerText || '').slice(0, 120000);
          if (
            preferMatchingJobIdInBlob &&
            jid &&
            needles.length &&
            !blobMatchesLinkedInJobNeedles(blob, needles)
          ) {
            continue;
          }
          txt = (r.innerText || '').trim();
          if (txt.length >= MIN_CANDIDATE_CHARS && txt.length > bestLen) {
            bestLen = txt.length;
            best = r;
          }
        }
      }
      return best;
    }

    var railSelectors = [
      '.jobs-search__right-rail',
      '[class*="jobs-search__right-rail"]',
      '[class*="jobs-split-view__right-rail"]',
      '[class*="scaffold-layout__detail"]'
    ];
    var railFirst =
      jid && needles.length ? bestByTextLength(railSelectors, true) : null;
    if (!railFirst) railFirst = bestByTextLength(railSelectors, false);
    if (railFirst) return railFirst;

    var wrappers = [
      '.jobs-search__job-details--wrapper',
      '[class*="jobs-search__job-details--wrapper"]',
      '[class*="job-details-jobs-unified-top-card"]'
    ];
    var w;
    var wi;
    var wj;
    var wnodes;
    var bestInner = null;
    var bestInnerLen = 0;
    for (wi = 0; wi < wrappers.length; wi++) {
      wnodes = [];
      try {
        wnodes = document.querySelectorAll(wrappers[wi]);
      } catch (e2) {
        /* invalid selector */
      }
      for (wj = 0; wj < wnodes.length; wj++) {
        w = wnodes[wj];
        if (isInsideSearchResultsRail(w) || isInsideCompactListJobCard(w)) continue;
        var inner = w.querySelector(
          '.jobs-search__job-details-body, article.jobs-description__container, [class*="jobs-details__main-content"]'
        );
        var tInner = inner ? (inner.innerText || '').trim() : '';
        if (inner && tInner.length >= MIN_CANDIDATE_CHARS && tInner.length > bestInnerLen) {
          bestInnerLen = tInner.length;
          bestInner = inner;
        }
      }
    }
    if (bestInner) return bestInner;

    for (wi = 0; wi < wrappers.length; wi++) {
      wnodes = [];
      try {
        wnodes = document.querySelectorAll(wrappers[wi]);
      } catch (e3) {
        wnodes = [];
      }
      for (wj = 0; wj < wnodes.length; wj++) {
        w = wnodes[wj];
        if (isInsideSearchResultsRail(w) || isInsideCompactListJobCard(w)) continue;
        var tWrap = (w.innerText || '').trim();
        if (tWrap.length >= MIN_CANDIDATE_CHARS) return w;
      }
    }

    return null;
  }

  function linkedInUrlJobId() {
    try {
      var u = new URL(window.location.href);
      var id = u.searchParams.get('currentJobId');
      if (id && /^\d+$/.test(String(id))) return String(id);
    } catch (e) {
      /* skip */
    }
    return null;
  }

  /** DOM / JSON-LD often use `urn:li:jobPosting:4393453758`, not the bare id — match all shapes. */
  function linkedInJobPostingNeedles(jid) {
    if (!jid) return [];
    return [jid, 'urn:li:jobPosting:' + jid, 'jobPosting:' + jid];
  }

  function blobMatchesLinkedInJobNeedles(blob, needles) {
    if (!blob || !needles.length) return false;
    var i;
    for (i = 0; i < needles.length; i++) {
      if (blob.indexOf(needles[i]) !== -1) return true;
    }
    return false;
  }

  /**
   * Prefer description nodes whose subtree references the URL job id (Li URN or numeric).
   * Runs before geometry heuristics so we never pick a longer unrelated pane or another listing.
   */
  function findLinkedInDetailBodyMatchingUrlJobId() {
    var jid = linkedInUrlJobId();
    if (!jid) return null;
    var needles = linkedInJobPostingNeedles(jid);
    var selectors = [
      '.jobs-search__job-details-body',
      'article.jobs-description__container',
      '[class*="jobs-details__main-content"]',
      '[class*="job-details-body"]'
    ];
    var best = null;
    var bestLen = 0;
    var si;
    var ni;
    var nodes;
    var el;
    var t;
    var blob;
    for (si = 0; si < selectors.length; si++) {
      try {
        nodes = document.querySelectorAll(selectors[si]);
      } catch (e) {
        nodes = [];
      }
      for (ni = 0; ni < nodes.length; ni++) {
        el = nodes[ni];
        if (isInsideSearchResultsRail(el) || isInsideCompactListJobCard(el)) continue;
        blob = (el.innerHTML || '') + '\n' + (el.outerHTML || '').slice(0, 80000);
        if (!blobMatchesLinkedInJobNeedles(blob, needles)) continue;
        t = (el.innerText || '').trim();
        if (t.length < MIN_CANDIDATE_CHARS) continue;
        if (t.length > bestLen) {
          bestLen = t.length;
          best = el;
        }
      }
    }
    return best;
  }

  function getLinkedInRootMatchingUrlJobId() {
    var jid = linkedInUrlJobId();
    if (!jid || !isLinkedInJobsPage()) return null;

    var detailColSelector = [
      '[class*="jobs-search__right-rail"]',
      '[class*="scaffold-layout__detail"]',
      '[class*="jobs-split-view__detail"]',
      '[class*="jobs-search__job-details"]',
      '[class*="jobs-unified-top-card"]'
    ].join(', ');

    var candidates = [];
    try {
      document.querySelectorAll('[data-job-id="' + jid + '"]').forEach(function (n) {
        candidates.push(n);
      });
    } catch (e) {
      /* skip */
    }

    try {
      document.querySelectorAll('[data-entity-urn*="jobPosting:' + jid + '"]').forEach(function (n) {
        candidates.push(n);
      });
    } catch (e2) {
      /* skip */
    }

    var i;
    var el;
    var detail;
    var td;
    var best = null;
    var bestLen = 0;

    for (i = 0; i < candidates.length; i++) {
      el = candidates[i];
      /* Left-list rows also carry data-job-id — ignore unless we're in the detail column. */
      if (el.closest('[class*="jobs-search-results"]') && !el.closest(detailColSelector)) continue;
      detail = el.closest(detailColSelector + ', article.jobs-description__container');
      if (!detail) {
        detail = el.closest('[class*="jobs-search__job-details"], [class*="jobs-unified"]');
      }
      if (!detail) continue;
      detail =
        detail.querySelector('.jobs-search__job-details-body, article.jobs-description__container') ||
        detail;
      td = (detail.innerText || '').trim();
      if (td.length >= MIN_CANDIDATE_CHARS && td.length > bestLen) {
        bestLen = td.length;
        best = detail;
      }
    }
    return best;
  }

  function getBestSplitViewDetailRoot() {
    if (isLinkedInJobsPage()) {
      /* URL wins: focused job is tied to currentJobId / urn:li:jobPosting — not max width or max length. */
      var urlMatchedBody = findLinkedInDetailBodyMatchingUrlJobId();
      if (urlMatchedBody) return urlMatchedBody;
      var linkedInId = getLinkedInRootMatchingUrlJobId();
      if (linkedInId) return linkedInId;
      var anchored = getLinkedInAnchoredDetailRoot();
      if (anchored) return anchored;
      var rightmost = getLinkedInRightmostDetailBody(true);
      if (!rightmost) rightmost = getLinkedInRightmostDetailBody(false);
      if (rightmost) return rightmost;
    }

    var linkedInRail = getLinkedInOpenJobPaneRoot();
    if (linkedInRail) return linkedInRail;

    var selectors = [
      '.jobs-search__job-details-body',
      '.jobs-details__main-content',
      '[class*="jobs-search__job-details"]',
      '[class*="jobs-details__main"]',
      '[class*="job-details-body"]',
      'article.jobs-description__container'
    ];
    var best = null;
    var bestLen = 0;
    var i;
    var j;
    for (i = 0; i < selectors.length; i++) {
      try {
        var found = document.querySelectorAll(selectors[i]);
        for (j = 0; j < found.length; j++) {
          var el = found[j];
          if (isInsideSearchResultsRail(el)) continue;
          if (isInsideCompactListJobCard(el)) continue;
          var t = (el.innerText || '').trim();
          if (t.length >= MIN_CANDIDATE_CHARS && t.length > bestLen) {
            bestLen = t.length;
            best = el;
          }
        }
      } catch (e) {
        /* skip */
      }
    }
    return best;
  }

  function collectCandidateRoots() {
    var seen = new WeakSet();
    var list = [];

    function add(el) {
      if (!el || el.nodeType !== 1) return;
      if (isInsideSearchResultsRail(el)) return;
      if (isInsideCompactListJobCard(el)) return;
      if (seen.has(el)) return;
      seen.add(el);
      list.push(el);
    }

    add(document.querySelector('main'));
    document.querySelectorAll('[role="main"]').forEach(add);

    var genericSelectors = [
      '[class*="job-description"]',
      '[class*="job-details"]',
      '[class*="JobDescription"]',
      '[class*="posting-body"]',
      '[id*="job-description"]',
      '[data-testid*="job"]'
    ];
    genericSelectors.forEach(function (sel) {
      try {
        document.querySelectorAll(sel).forEach(add);
      } catch (e) {
        /* skip */
      }
    });

    document.querySelectorAll('article').forEach(function (a) {
      var t = (a.innerText || '').trim();
      if (t.length >= MIN_CANDIDATE_CHARS && !isInsideCompactListJobCard(a)) add(a);
    });

    addHostnameHints(window.location.hostname, window.location.pathname, add);
    addSiteConnectorRoots(window.location.hostname || '', add);

    return list;
  }

  function scoreRoot(el, text) {
    var lower = text.toLowerCase();
    var s = 0;
    s += Math.min(text.length, 40000) * 0.002;
    var k;
    for (k = 0; k < JOB_KEYWORDS.length; k++) {
      if (lower.indexOf(JOB_KEYWORDS[k]) !== -1) s += 40;
    }
    var pCount = el.querySelectorAll('p').length;
    s += Math.min(pCount, 40) * 8;

    var lines = text.split('\n').map(function (l) {
      return l.trim();
    }).filter(Boolean);
    if (lines.length > 8) {
      var shortLines = lines.filter(function (l) {
        return l.length < 55;
      }).length;
      var ratio = shortLines / lines.length;
      if (ratio > 0.82) s -= 400;
    }

    return s;
  }

  function pickBestContentRoot() {
    var splitDetail = getBestSplitViewDetailRoot();
    if (splitDetail) {
      return splitDetail;
    }

    var candidates = collectCandidateRoots();
    var best = null;
    var bestScore = -Infinity;
    var i;
    for (i = 0; i < candidates.length; i++) {
      var el = candidates[i];
      var text = (el.innerText || '').trim();
      if (text.length < MIN_CANDIDATE_CHARS) continue;
      var sc = scoreRoot(el, text);
      if (el.tagName === 'MAIN' && document.querySelector('[class*="jobs-search-results"]')) {
        sc -= 300;
      }
      if (sc > bestScore) {
        bestScore = sc;
        best = el;
      }
    }
    return best || document.body;
  }

  function removeSplitViewListRails(node) {
    try {
      node.querySelectorAll('[class*="jobs-search-results"]').forEach(function (el) {
        el.remove();
      });
      node.querySelectorAll('[class*="scaffold-layout__list"]').forEach(function (el) {
        el.remove();
      });
      node.querySelectorAll('[class*="search-results__list"]').forEach(function (el) {
        el.remove();
      });
      node.querySelectorAll('[class*="job-card-list"]').forEach(function (el) {
        el.remove();
      });
      node.querySelectorAll('[class*="reusable-search__result-container"]').forEach(function (el) {
        el.remove();
      });
      node.querySelectorAll('[class*="job-card-container"]').forEach(function (el) {
        if (el.closest('[class*="jobs-search__right-rail"]')) return;
        if (el.closest('[class*="jobs-search__job-details--wrapper"]')) return;
        if (el.closest('[class*="jobs-unified-top-card"]')) return;
        if (el.closest('[class*="jobs-unified"]')) return;
        el.remove();
      });
    } catch (e) {
      /* skip */
    }
    return node;
  }

  var REMOVE_SELECTORS = [
    'script',
    'style',
    'noscript',
    'iframe',
    'svg',
    'canvas',
    'template',
    'link',
    'meta',
    'code',
    'pre',
    '[type="application/json"]',
    '[type="application/ld+json"]',
    'header',
    'footer',
    'nav',
    'aside',
    '[role="navigation"]',
    '[role="banner"]',
    '[role="contentinfo"]',
    '[role="complementary"]',
    '[aria-hidden="true"]',
    '[hidden]',
    '.hidden',
    '.visually-hidden',
    '[style*="display: none"]',
    '[style*="display:none"]',
    '.cookie-banner',
    '.cookie-consent',
    '[class*="cookie"]',
    '.popup',
    '.modal',
    '.overlay',
    '.dialog',
    '[role="dialog"]',
    '.advertisement',
    '.ad-container',
    '[class*="advert"]',
    '[id*="google_ads"]',
    '[class*="sponsored"]',
    '[class*="promo"]',
    '.social-share',
    '.share-buttons',
    '.comments',
    '.comment-section',
    '[class*="chat-widget"]',
    '[class*="intercom"]',
    '[class*="drift"]',
    '[class*="zendesk"]'
  ];

  function cleanText(raw) {
    var text = raw
      .replace(/\t/g, ' ')
      .replace(/[ ]{2,}/g, ' ')
      .replace(/\n{3,}/g, '\n\n')
      .replace(/^\s+$/gm, '')
      .trim();

    text = text.replace(/\s*\(Verified job\)\s*/gi, ' ');
    text = text.replace(/\s*\(Promoted\)\s*/gi, ' ');

    text = text
      .split('\n')
      .filter(function (line) {
        var trimmed = line.trim();
        if (trimmed.startsWith('{') && trimmed.indexOf('"$type"') !== -1) return false;
        if (trimmed.startsWith('[') && trimmed.indexOf('"$type"') !== -1) return false;
        if (trimmed.indexOf('urn:li:') !== -1) return false;
        if (trimmed.indexOf('entityUrn') !== -1) return false;
        if (trimmed.indexOf('chameleon') !== -1) return false;
        if (trimmed.indexOf('lixTracking') !== -1) return false;
        if (trimmed.length > 500 && trimmed.indexOf(' ') === -1) return false;
        return true;
      })
      .join('\n');

    return text.trim();
  }

  function removeUnwantedElements(node) {
    REMOVE_SELECTORS.forEach(function (selector) {
      try {
        node.querySelectorAll(selector).forEach(function (el) {
          el.remove();
        });
      } catch (e) {
        /* skip */
      }
    });
    try {
      node.querySelectorAll('[data-entity-hovercard-id]').forEach(function (el) {
        el.remove();
      });
      node.querySelectorAll('[data-tracking-control-name]').forEach(function (el) {
        el.remove();
      });
    } catch (e2) {
      /* skip */
    }
    return node;
  }

  /**
   * Heuristic for popup UX (tips when extraction may be noisy). Not used server-side.
   */
  function computeExtractionConfidence(content, source) {
    var c = content || '';
    var len = c.length;
    var lines = c.split(/\r?\n/).map(function (l) {
      return l.trim();
    }).filter(Boolean).length;
    if (source === 'ashby-api') {
      if (len >= 800 && lines >= 10) return 'high';
      if (len < 400) return 'low';
      return 'medium';
    }
    if (source === 'selection') return 'high';
    if (!c) return 'low';
    if (source === 'json-ld' || source === 'json-ld+dom') {
      if (len >= 550 && lines >= 8) return 'high';
      if (len < 320) return 'low';
      return lines >= 5 ? 'medium' : 'low';
    }
    if (len >= 2800 && lines >= 14) return 'high';
    if (len < 380) return 'low';
    if (lines < 5 && len < 2200) return 'low';
    if (source === 'dom' && len < 1100) return 'medium';
    return 'medium';
  }

  function finalizeExtractResult(result) {
    result.confidence = computeExtractionConfidence(result.content, result.source);
    return result;
  }

  /** Ashby embed pages (e.g. marketing site + `?ashby_jid=`) load listing via script; DOM is mostly chrome. */
  function getAshbyJidFromSearchParams() {
    try {
      var u = new URL(window.location.href);
      var jid = (u.searchParams.get('ashby_jid') || '').trim();
      if (!/^[0-9a-f-]{36}$/i.test(jid)) return '';
      return jid.toLowerCase();
    } catch (e) {
      return '';
    }
  }

  /** `<script src="https://jobs.ashbyhq.com/{slug}/embed">` */
  function detectAshbyEmbedBoardSlugFromDom() {
    var scripts = document.querySelectorAll('script[src*="ashbyhq.com"]');
    var i;
    var src;
    var m;
    for (i = 0; i < scripts.length; i++) {
      src = scripts[i].getAttribute('src') || '';
      m = src.match(/jobs\.ashbyhq\.com\/([^/?#]+)\/embed/i);
      if (m && m[1]) return m[1];
    }
    return '';
  }

  function ashbyBoardSlugFallbackForHostname(host) {
    var h = (host || '').toLowerCase();
    if (/^(www\.)?clay\.com$/i.test(h)) return 'claylabs';
    return '';
  }

  function formatAshbyPublicJobPlain(job) {
    if (!job || typeof job !== 'object') return '';
    var lines = [];
    if (job.title) lines.push(String(job.title).trim());
    if (job.team) lines.push('Team: ' + String(job.team).trim());
    if (job.department) lines.push('Department: ' + String(job.department).trim());
    if (job.location) lines.push('Location: ' + String(job.location).trim());
    if (job.workplaceType) lines.push('Workplace: ' + String(job.workplaceType));
    if (job.employmentType) lines.push('Employment: ' + String(job.employmentType));
    var desc = job.descriptionPlain;
    if (desc) {
      lines.push('');
      lines.push(String(desc).trim());
    } else if (job.descriptionHtml) {
      lines.push('');
      lines.push(htmlToPlainText(String(job.descriptionHtml)));
    }
    return lines.join('\n').trim();
  }

  /**
   * Fetches the public Ashby job board JSON and returns the posting matching `ashby_jid` in the URL.
   * Requires manifest host permission `https://api.ashbyhq.com/*`.
   */
  async function tryAshbyPublicPostingFromEmbedPage() {
    var jid = getAshbyJidFromSearchParams();
    if (!jid) return '';
    var slug = detectAshbyEmbedBoardSlugFromDom() || ashbyBoardSlugFallbackForHostname(window.location.hostname || '');
    if (!slug) return '';
    var apiUrl = 'https://api.ashbyhq.com/posting-api/job-board/' + encodeURIComponent(slug);
    try {
      var res = await fetch(apiUrl, { credentials: 'omit', cache: 'no-store' });
      if (!res.ok) return '';
      var data = await res.json();
      var jobs = data && data.jobs;
      if (!Array.isArray(jobs)) return '';
      var i;
      var id;
      for (i = 0; i < jobs.length; i++) {
        id = jobs[i] && jobs[i].id;
        if (id && String(id).toLowerCase() === jid) return formatAshbyPublicJobPlain(jobs[i]);
      }
    } catch (e) {
      /* network / parse — fall back to DOM */
    }
    return '';
  }

  function extractPageContent() {
    var result = { content: '', title: document.title || '', source: 'dom' };

    var selection = window.getSelection().toString().trim();
    if (selection.length >= MIN_SELECTION_CHARS) {
      result.content = capContent(cleanText(selection));
      result.source = 'selection';
      return finalizeExtractResult(result);
    }

    var ldText = shouldSkipJsonLdForLinkedInJobs() ? '' : extractJobPostingFromJsonLd();
    var domText = buildDomExtractedText();

    if (ldText.length >= MIN_JSON_LD_CHARS) {
      if (isDomSupersetOfLd(ldText, domText) && domText.length >= ldText.length) {
        result.content = maybeAppendMetaDescription(domText);
        result.source = 'dom';
        return finalizeExtractResult(result);
      }
      result.content = maybeAppendMetaDescription(capContent(ldText));
      result.source = 'json-ld';
      return finalizeExtractResult(result);
    }

    if (ldText.length >= 40) {
      if (domText.length < 80) {
        result.content = maybeAppendMetaDescription(capContent(ldText));
        result.source = 'json-ld';
        return finalizeExtractResult(result);
      }
      if (isDomSupersetOfLd(ldText, domText)) {
        result.content = maybeAppendMetaDescription(domText);
        result.source = 'dom';
        return finalizeExtractResult(result);
      }
      result.content = maybeAppendMetaDescription(capContent(ldText + '\n\n---\n\n' + domText));
      result.source = 'json-ld+dom';
      return finalizeExtractResult(result);
    }

    result.content = maybeAppendMetaDescription(domText);
    result.source = 'dom';
    return finalizeExtractResult(result);
  }

  /**
   * SPA / lazy panels: run twice after a delay and keep the richer extraction.
   * Ashby embed on third-party sites: resolve full description via public posting API.
   */
  window.__jaaExtractPageContentAsync = async function () {
    var ashbyApiText = await tryAshbyPublicPostingFromEmbedPage();

    var first = extractPageContent();
    if (first && first.source === 'selection' && (first.content || '').length >= MIN_SELECTION_CHARS) {
      return first;
    }

    await new Promise(function (resolve) {
      setTimeout(resolve, 500);
    });
    var second = extractPageContent();
    if (second && second.source === 'selection' && (second.content || '').length >= MIN_SELECTION_CHARS) {
      return second;
    }

    var a = (first && first.content) || '';
    var b = (second && second.content) || '';
    var domBest = b.length > a.length + 120 ? second : first;

    if (ashbyApiText && ashbyApiText.length > (domBest.content || '').length + 50) {
      return finalizeExtractResult({
        content: capContent(cleanText(ashbyApiText)),
        title: document.title || '',
        source: 'ashby-api'
      });
    }
    return domBest;
  };

  window.__jaaExtractPageContent = extractPageContent;
})();
