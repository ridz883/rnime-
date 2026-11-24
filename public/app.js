(function () {
  "use strict";

  const root = document.getElementById("appRoot");
  const FALLBACK_POSTER =
    "data:image/svg+xml;charset=UTF-8," +
    encodeURIComponent(
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 450"><rect width="300" height="450" fill="#161c2a"/><text x="50%" y="50%" fill="#64748b" font-family="sans-serif" font-size="18" text-anchor="middle">No Poster</text></svg>'
    );

  const appState = {
    genres: [],
    watch: {
      video: null,
      selectedMirrorIdx: 0,
      selectedQuality: "ALL",
      selectedHost: "",
      forceMode: "auto", // auto | video | iframe
      comments: [],
      nextCursor: null,
      hasMore: false,
      totalComments: 0
    }
  };

  function esc(str) {
    if (str == null) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function imgTag(src, alt, cls) {
    const safeSrc = src ? esc(src) : FALLBACK_POSTER;
    return `<img class="${cls || "card-thumb"}" src="${safeSrc}" alt="${esc(alt || "Poster")}" loading="lazy" referrerpolicy="no-referrer" onerror="this.onerror=null;this.src='${FALLBACK_POSTER}';" />`;
  }

  function renderSkeleton(title) {
    root.innerHTML = `
      <div class="container">
        <div class="sec-head">
          <h2 class="sec-title">${esc(title || "Memuat...")}</h2>
        </div>
        <div class="skeleton-grid">
          ${Array(12).fill('<div class="skeleton-tile"></div>').join("")}
        </div>
      </div>
    `;
  }

  function renderError(title, msg) {
    root.innerHTML = `
      <div class="container">
        <div class="state-box">
          <h2 style="color:#fff; margin-bottom:8px;">${esc(title)}</h2>
          <p style="margin-bottom:16px;">${esc(msg)}</p>
          <a href="#home" class="btn-primary">Kembali ke Beranda</a>
        </div>
      </div>
    `;
  }

  function renderCard(item, forceKind) {
    const kind = forceKind || item.type || "anime";
    const isEp = kind === "episode";
    const href = isEp ? `#watch/${encodeURIComponent(item.slug)}` : `#anime/${encodeURIComponent(item.slug)}`;
    const thumb = item.image || item.thumbnail || item.cover;
    return `
      <a class="card-anime" href="${href}">
        <div class="card-thumb-wrap">
          ${imgTag(thumb, item.title, "card-thumb")}
          ${item.episode != null ? `<span class="badge-tl">EP ${esc(item.episode)}</span>` : (item.badgeType || item.type ? `<span class="badge-tl">${esc(item.badgeType || item.type)}</span>` : "")}
          ${item.score != null ? `<span class="badge-tr">★ ${esc(item.score)}</span>` : ""}
          ${item.status ? `<span class="badge-bl">${esc(item.status)}</span>` : ""}
        </div>
        <div class="card-body">
          <div class="card-title">${esc(item.title || item.slug)}</div>
          <div class="card-meta">
            <span>${esc(item.ago || item.year || (isEp ? "Episode Baru" : "Anime"))}</span>
            ${item.views != null ? `<span>${Number(item.views).toLocaleString("id-ID")} views</span>` : ""}
          </div>
        </div>
      </a>
    `;
  }

  function setActiveNav(route) {
    document.querySelectorAll("[data-route]").forEach((el) => {
      el.classList.toggle("active", el.dataset.route === route);
    });
  }

  /* --------------------------------------------------- 1. HOME VIEW */

  async function viewHome(params) {
    setActiveNav("home");
    const page = Math.max(1, parseInt(params.get("page"), 10) || 1);
    renderSkeleton(`Memuat Beranda Halaman ${page}...`);

    try {
      const res = await fetch(`/api/home?page=${page}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Gagal memuat beranda");

      const d = json.data;
      const featured = (d.episodes && d.episodes[0]) || (d.anime && d.anime[0]) || (d.cards && d.cards[0]);

      const heroHtml = featured
        ? `
          <section class="hero-spotlight">
            <div class="hero-bg" style="background-image:url('${esc(featured.image || "")}')"></div>
            <div class="hero-overlay"></div>
            <div class="hero-content">
              ${imgTag(featured.image, featured.title, "hero-poster")}
              <div>
                <span class="hero-tag">${featured.type === "episode" ? `Update Terbaru • EP ${esc(featured.episode || "")}` : "Rekomendasi Beranda"}</span>
                <h1 class="hero-title">${esc(featured.title)}</h1>
                <div class="hero-meta">
                  ${featured.ago ? `<span>Rilis ${esc(featured.ago)}</span>` : ""}
                  ${featured.score ? `<span>★ ${esc(featured.score)}</span>` : ""}
                  ${d.title ? `<span>${esc(d.title)}</span>` : ""}
                </div>
                <div style="display:flex; flex-wrap:wrap; gap:10px;">
                  <a class="btn-primary" href="${featured.type === "episode" ? `#watch/${encodeURIComponent(featured.slug)}` : `#anime/${encodeURIComponent(featured.slug)}`}">
                    ▶ ${featured.type === "episode" ? "Tonton Sekarang" : "Lihat Detail Anime"}
                  </a>
                  <a class="btn-secondary" href="#schedule">Lihat Jadwal Rilis</a>
                </div>
              </div>
            </div>
          </section>
        `
        : "";

      const episodesHtml = (d.episodes && d.episodes.length)
        ? `
          <div class="sec-head">
            <h2 class="sec-title">Episode Terbaru</h2>
            <span class="sec-sub">Halaman ${d.page}${d.totalPages ? ` dari ${d.totalPages}` : ""}</span>
          </div>
          <div class="anime-grid">${d.episodes.map((ep) => renderCard(ep, "episode")).join("")}</div>
        `
        : "";

      const animeHtml = (d.anime && d.anime.length)
        ? `
          <div class="sec-head">
            <h2 class="sec-title">Koleksi Anime Pilihan</h2>
            <a href="#discover" class="btn-secondary">Lihat Semua →</a>
          </div>
          <div class="anime-grid">${d.anime.map((a) => renderCard(a, "anime")).join("")}</div>
        `
        : "";

      const fallbackCardsHtml = (!d.episodes.length && !d.anime.length && d.cards && d.cards.length)
        ? `<div class="anime-grid">${d.cards.map((c) => renderCard(c)).join("")}</div>`
        : "";

      root.innerHTML = `
        <div class="container">
          ${heroHtml}
          ${episodesHtml}
          ${animeHtml}
          ${fallbackCardsHtml}
          <div class="pagination-bar">
            <a class="btn-secondary ${d.page <= 1 ? "hidden" : ""}" href="#home?page=${d.page - 1}">← Sebelumnya</a>
            <span class="page-pill">Halaman ${d.page}${d.totalPages ? ` / ${d.totalPages}` : ""}</span>
            <a class="btn-secondary ${d.totalPages && d.page >= d.totalPages ? "hidden" : ""}" href="#home?page=${d.page + 1}">Berikutnya →</a>
          </div>
        </div>
      `;
    } catch (err) {
      renderError("Beranda Gagal Dimuat", err.message);
    }
  }

  /* --------------------------------------------------- 2. ANIME DETAIL */

  async function viewAnime(slug) {
    setActiveNav("discover");
    renderSkeleton("Memuat Detail Anime...");

    try {
      const res = await fetch(`/api/anime?slug=${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Anime tidak ditemukan");

      const a = json.data;
      const latestEp = a.episodes && a.episodes[0];
      const firstEp = a.episodes && a.episodes[a.episodes.length - 1];

      root.innerHTML = `
        <div class="container">
          <section class="detail-hero">
            <div class="hero-bg" style="background-image:url('${esc(a.cover || a.poster || "")}')"></div>
            <div class="hero-overlay"></div>
            <div class="detail-grid">
              <div>
                ${imgTag(a.poster, a.title, "detail-poster")}
              </div>
              <div>
                <h1 class="detail-title">${esc(a.title)}</h1>
                ${a.alternativeTitles ? `<div class="detail-alt">${esc(Array.isArray(a.alternativeTitles) ? a.alternativeTitles.join(" • ") : a.alternativeTitles)}</div>` : ""}

                <div class="detail-badges">
                  ${a.score ? `<span class="pill pill-gold">★ ${esc(a.score)}${a.votes ? ` (${Number(a.votes).toLocaleString("id-ID")} votes)` : ""}</span>` : ""}
                  ${a.status ? `<span class="pill pill-accent">${esc(a.status)}</span>` : ""}
                  ${a.type ? `<span class="pill">${esc(a.type)}</span>` : ""}
                  ${a.year ? `<span class="pill">${esc(a.year)}</span>` : ""}
                  ${a.season ? `<span class="pill">${esc(a.season)}</span>` : ""}
                </div>

                <div class="genre-chips">
                  ${(a.genres || []).map((g) => `<a class="genre-chip" href="#discover?genre=${encodeURIComponent(g.toLowerCase().replace(/[^a-z0-9]+/g, "-"))}">${esc(g)}</a>`).join("")}
                </div>

                <p class="detail-synopsis">${esc(a.synopsis || "Sinopsis belum tersedia.")}</p>

                <div style="display:flex; flex-wrap:wrap; gap:10px;">
                  ${firstEp ? `<a class="btn-primary" href="#watch/${encodeURIComponent(firstEp.slug)}">▶ Mulai Episode ${esc(firstEp.number || 1)}</a>` : ""}
                  ${latestEp && latestEp !== firstEp ? `<a class="btn-secondary" href="#watch/${encodeURIComponent(latestEp.slug)}">Episode Terbaru (EP ${esc(latestEp.number || "")})</a>` : ""}
                  <a class="btn-secondary" href="${esc(a.url)}" target="_blank" rel="noopener">Sumber Asli ↗</a>
                </div>

                <div class="info-grid">
                  <div class="info-cell"><span>Total Episode</span><strong>${esc(a.episodeCount || (a.episodes ? a.episodes.length : "—"))}</strong></div>
                  <div class="info-cell"><span>Durasi</span><strong>${esc(a.duration || "—")}</strong></div>
                  <div class="info-cell"><span>Studio</span><strong>${esc(a.studio || "—")}</strong></div>
                  <div class="info-cell"><span>Sutradara</span><strong>${esc(a.director || "—")}</strong></div>
                  <div class="info-cell"><span>Produser</span><strong>${esc(a.producer || "—")}</strong></div>
                  <div class="info-cell"><span>Subtitle</span><strong>${esc(a.subtitle || "Indonesia")}</strong></div>
                  <div class="info-cell"><span>Fansub</span><strong>${esc(a.fansub || "—")}</strong></div>
                  <div class="info-cell"><span>Slug</span><strong>${esc(a.slug)}</strong></div>
                </div>
              </div>
            </div>
          </section>

          <section class="episodes-panel">
            <div class="sec-head" style="margin-bottom:10px;">
              <h2 class="sec-title">Daftar Episode (${(a.episodes || []).length})</h2>
              <div style="display:flex; gap:8px;">
                <input type="search" id="epFilterInput" placeholder="Filter nomor episode..." style="background:var(--bg-input); border:1px solid var(--border-strong); color:#fff; border-radius:8px; padding:7px 11px; font-size:0.84rem;" />
                <button type="button" id="btnReloadEpisodes" class="btn-secondary">Muat Ulang Episode</button>
              </div>
            </div>
            <div id="animeEpList" class="ep-grid"></div>
          </section>
        </div>
      `;

      let episodesData = a.episodes || [];
      function drawEpisodes(filterText) {
        const box = document.getElementById("animeEpList");
        const q = (filterText || "").trim().toLowerCase();
        const filtered = q
          ? episodesData.filter((e) => String(e.number || "").includes(q) || String(e.title || "").toLowerCase().includes(q))
          : episodesData;
        if (!filtered.length) {
          box.innerHTML = `<div style="grid-column:1/-1; color:var(--text-muted); padding:16px;">Episode tidak ditemukan.</div>`;
          return;
        }
        box.innerHTML = filtered.map((ep) => `
          <a class="ep-btn" href="#watch/${encodeURIComponent(ep.slug)}">
            <span>EP ${esc(ep.number != null ? ep.number : "?")}</span>
            <span style="color:var(--text-muted); font-size:0.76rem; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(ep.title || "Tonton")}</span>
          </a>
        `).join("");
      }

      drawEpisodes("");
      document.getElementById("epFilterInput").addEventListener("input", (e) => drawEpisodes(e.target.value));
      document.getElementById("btnReloadEpisodes").addEventListener("click", async () => {
        const btn = document.getElementById("btnReloadEpisodes");
        btn.disabled = true;
        btn.textContent = "Memuat...";
        try {
          const r = await fetch(`/api/anime?slug=${encodeURIComponent(a.slug)}&only=episodes&refresh=1`);
          const j = await r.json();
          if (j.ok && j.data && Array.isArray(j.data.episodes)) {
            episodesData = j.data.episodes;
            drawEpisodes(document.getElementById("epFilterInput").value);
          }
        } finally {
          btn.disabled = false;
          btn.textContent = "Muat Ulang Episode";
        }
      });
    } catch (err) {
      renderError("Gagal Memuat Anime", err.message);
    }
  }

  /* --------------------------------------------------- 3. WATCH EPISODE */

  function applyHostFallback(rawUrl, fallbackHost) {
    if (!rawUrl || !fallbackHost) return rawUrl;
    try {
      const target = new URL(rawUrl);
      const cleanHost = String(fallbackHost).trim();
      if (/^https?:\/\//i.test(cleanHost)) {
        const replacement = new URL(cleanHost);
        target.protocol = replacement.protocol;
        target.host = replacement.host;
      } else {
        target.host = cleanHost.replace(/^\/+|\/+$/g, "");
      }
      return target.toString();
    } catch (e) {
      return rawUrl;
    }
  }

  function extractFallbackHosts(video) {
    const hosts = [];
    const seen = new Set();
    const pushHost = (val) => {
      if (!val) return;
      const h = typeof val === "string" ? val : (val.host || val.url || val.domain || "");
      if (h && !seen.has(h)) {
        seen.add(h);
        hosts.push(h);
      }
    };
    (video.hostFallbacks || []).forEach(pushHost);
    const groups = video.hostFallbackGroups || [];
    if (Array.isArray(groups)) {
      groups.forEach((g) => {
        if (Array.isArray(g)) g.forEach(pushHost);
        else if (g && Array.isArray(g.hosts)) g.hosts.forEach(pushHost);
        else pushHost(g);
      });
    } else if (groups && typeof groups === "object") {
      Object.values(groups).forEach((arr) => {
        if (Array.isArray(arr)) arr.forEach(pushHost);
      });
    }
    return hosts;
  }

  function renderActivePlayer() {
    const shell = document.getElementById("videoPlayerShell");
    const directBtn = document.getElementById("btnOpenMirrorExternal");
    const v = appState.watch.video;
    if (!shell || !v) return;

    const mirrors = v.mirrors || [];
    const mirror = mirrors[appState.watch.selectedMirrorIdx];

    if (!mirror || !mirror.url) {
      shell.innerHTML = `<div class="player-empty"><strong>Mirror video tidak tersedia untuk episode ini.</strong><p>Coba muat ulang mirror atau buka halaman sumber asli.</p></div>`;
      if (directBtn) directBtn.classList.add("hidden");
      return;
    }

    const finalUrl = appState.watch.selectedHost
      ? applyHostFallback(mirror.url, appState.watch.selectedHost)
      : mirror.url;

    if (directBtn) {
      directBtn.href = finalUrl;
      directBtn.classList.remove("hidden");
    }

    const isDirectVideo =
      /\.mp4(\?|$)|\.webm(\?|$)/i.test(finalUrl) ||
      /mp4|direct|video|html5/i.test(String(mirror.type || ""));

    const useVideoTag =
      appState.watch.forceMode === "video" ||
      (appState.watch.forceMode === "auto" && isDirectVideo);

    if (useVideoTag) {
      shell.innerHTML = `
        <video controls autoplay playsinline referrerpolicy="no-referrer" poster="${esc(v.poster || "")}">
          <source src="${esc(finalUrl)}" type="video/mp4" />
          Browser tidak mendukung tag video HTML5.
        </video>
      `;
    } else {
      shell.innerHTML = `
        <iframe
          src="${esc(finalUrl)}"
          allowfullscreen
          allow="autoplay; fullscreen; picture-in-picture"
          referrerpolicy="no-referrer"
        ></iframe>
      `;
    }
  }

  async function loadWatchComments(episodeId, cursor, append) {
    const box = document.getElementById("watchCommentsBox");
    const countEl = document.getElementById("commentsCountBadge");
    const moreBtn = document.getElementById("btnLoadMoreComments");
    if (!box) return;

    if (!append) {
      box.innerHTML = `<p style="color:var(--text-muted); font-size:0.86rem;">Memuat komentar...</p>`;
    } else if (moreBtn) {
      moreBtn.disabled = true;
      moreBtn.textContent = "Memuat...";
    }

    try {
      const qs = new URLSearchParams({ episodeId: String(episodeId), limit: "10" });
      if (cursor) qs.set("cursor", String(cursor));
      const res = await fetch(`/api/comments?${qs.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Gagal memuat komentar");

      const d = json.data;
      appState.watch.comments = append ? appState.watch.comments.concat(d.comments || []) : (d.comments || []);
      appState.watch.nextCursor = d.nextCursor;
      appState.watch.hasMore = !!d.hasMore;
      appState.watch.totalComments = d.total || appState.watch.comments.length;

      if (countEl) countEl.textContent = `${appState.watch.totalComments} Komentar`;

      if (!appState.watch.comments.length) {
        box.innerHTML = `<p style="color:var(--text-muted); font-size:0.86rem;">Belum ada komentar pada episode ini.</p>`;
      } else {
        box.innerHTML = appState.watch.comments.map((c) => {
          const author = c.author || (c.user && (c.user.name || c.user.username)) || c.username || "Penonton";
          const date = c.createdAt || c.date || c.timeAgo || "";
          const body = c.content || c.text || c.body || c.message || "";
          return `
            <div class="comment-row">
              <div class="comment-meta">
                <span>${esc(author)}</span>
                <span>${esc(date)}</span>
              </div>
              <div class="comment-body">${esc(body)}</div>
            </div>
          `;
        }).join("");
      }

      if (moreBtn) {
        moreBtn.classList.toggle("hidden", !appState.watch.hasMore || !appState.watch.nextCursor);
        moreBtn.disabled = false;
        moreBtn.textContent = "Muat Komentar Lainnya";
      }
    } catch (err) {
      box.innerHTML = `<p style="color:var(--accent); font-size:0.86rem;">${esc(err.message)}</p>`;
    }
  }

  async function viewWatch(slug) {
    setActiveNav("home");
    renderSkeleton("Menyiapkan Video & Server Mirror...");

    try {
      const res = await fetch(`/api/watch?slug=${encodeURIComponent(slug)}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Episode gagal dimuat");

      const { video, playlist } = json.data;
      appState.watch = {
        video,
        selectedMirrorIdx: 0,
        selectedQuality: "ALL",
        selectedHost: "",
        forceMode: "auto",
        comments: [],
        nextCursor: null,
        hasMore: false,
        totalComments: 0
      };

      const mirrors = video.mirrors || [];
      const qualities = video.qualityOptions && video.qualityOptions.length
        ? video.qualityOptions
        : Array.from(new Set(mirrors.map((m) => m.quality).filter(Boolean)));
      const fallbacks = extractFallbackHosts(video);
      const playlistEps = (playlist && playlist.episodes) || [];

      root.innerHTML = `
        <div class="container">
          <div class="watch-layout">
            <div>
              <div id="videoPlayerShell" class="player-shell"></div>

              <div class="watch-controls-card">
                <div class="watch-nav-row">
                  <div>
                    <h1 style="font-family:'Outfit',sans-serif; font-size:1.3rem; line-height:1.25;">${esc(video.title || video.slug || `Episode #${video.id}`)}</h1>
                    <div style="font-size:0.8rem; color:var(--text-muted); margin-top:4px; display:flex; flex-wrap:wrap; gap:10px;">
                      <span>Episode ID: <strong>${esc(video.id)}</strong></span>
                      ${video.episode ? `<span>Episode <strong>${esc(video.episode)}${video.total ? ` / ${esc(video.total)}` : ""}</strong></span>` : ""}
                      ${video.duration ? `<span>Durasi: <strong>${esc(video.duration)}</strong></span>` : ""}
                    </div>
                  </div>
                  <div style="display:flex; flex-wrap:wrap; gap:8px;">
                    ${video.prev ? `<a class="btn-secondary" href="#watch/${encodeURIComponent(video.prev.slug)}">← EP ${esc(video.prev.number || "Prev")}</a>` : ""}
                    ${video.animeSlug ? `<a class="btn-secondary" href="#anime/${encodeURIComponent(video.animeSlug)}">Detail Anime</a>` : ""}
                    ${video.next ? `<a class="btn-primary" href="#watch/${encodeURIComponent(video.next.slug)}">EP ${esc(video.next.number || "Next")} →</a>` : ""}
                  </div>
                </div>

                ${qualities.length ? `
                  <div class="mirror-section">
                    <div class="mirror-label">Filter Kualitas Video</div>
                    <div class="mirror-chips" id="qualityChips">
                      <button type="button" class="mirror-btn active" data-quality="ALL">Semua</button>
                      ${qualities.map((q) => `<button type="button" class="mirror-btn" data-quality="${esc(q)}">${esc(q)}</button>`).join("")}
                    </div>
                  </div>
                ` : ""}

                <div class="mirror-section">
                  <div class="mirror-label">Pilih Server Mirror (${mirrors.length} Tersedia)</div>
                  <div class="mirror-chips" id="mirrorChips"></div>
                </div>

                ${fallbacks.length ? `
                  <div class="mirror-section">
                    <div class="mirror-label">Host Fallback Cadangan (Jika video gagal/buffer)</div>
                    <div class="mirror-chips" id="fallbackChips">
                      <button type="button" class="mirror-btn active" data-host="">Host Default</button>
                      ${fallbacks.map((h) => `<button type="button" class="mirror-btn" data-host="${esc(h)}">${esc(h)}</button>`).join("")}
                    </div>
                  </div>
                ` : ""}

                <div style="display:flex; flex-wrap:wrap; gap:8px; padding-top:10px; border-top:1px solid var(--border-subtle);">
                  <button type="button" class="btn-secondary" id="btnTogglePlayerMode">Mode Player: Otomatis</button>
                  <button type="button" class="btn-secondary" id="btnRefreshMirrors">Muat Ulang Mirror</button>
                  <a id="btnOpenMirrorExternal" class="btn-secondary hidden" href="#" target="_blank" rel="noopener">Buka Stream Langsung ↗</a>
                  ${video.url ? `<a class="btn-secondary" href="${esc(video.url)}" target="_blank" rel="noopener">Halaman Sokuja ↗</a>` : ""}
                </div>
              </div>

              <section class="comments-card">
                <div class="sec-head" style="margin-bottom:8px;">
                  <h2 class="sec-title">Komentar Episode</h2>
                  <span id="commentsCountBadge" class="pill">Memuat...</span>
                </div>
                <div id="watchCommentsBox"></div>
                <div style="margin-top:14px; text-align:center;">
                  <button type="button" id="btnLoadMoreComments" class="btn-secondary hidden">Muat Komentar Lainnya</button>
                </div>
              </section>
            </div>

            <aside class="playlist-box">
              <div class="sec-head" style="margin-bottom:6px;">
                <h2 class="sec-title" style="font-size:1.1rem;">Playlist Episode</h2>
                <span class="pill">${playlistEps.length}</span>
              </div>
              <div class="playlist-list">
                ${playlistEps.length
                  ? playlistEps.map((ep) => {
                      const epSlug = ep.slug || "";
                      const isCurrent = epSlug && (epSlug === playlist.currentSlug || epSlug === video.slug);
                      const epNum = ep.episodeNumber != null ? ep.episodeNumber : (ep.number != null ? ep.number : "");
                      return `
                        <a class="ep-btn ${isCurrent ? "active" : ""}" href="#watch/${encodeURIComponent(epSlug)}">
                          <span>${epNum !== "" ? `EP ${esc(epNum)}` : "Episode"}</span>
                          <span style="font-size:0.76rem; color:${isCurrent ? "#fff" : "var(--text-muted)"}; overflow:hidden; text-overflow:ellipsis; white-space:nowrap;">${esc(ep.title || epSlug)}</span>
                        </a>
                      `;
                    }).join("")
                  : `<p style="color:var(--text-muted); font-size:0.84rem; padding:10px 0;">Playlist episode tidak tersedia. Gunakan tombol Detail Anime untuk daftar lengkap.</p>`
                }
              </div>
            </aside>
          </div>
        </div>
      `;

      function drawMirrorButtons() {
        const container = document.getElementById("mirrorChips");
        const qFilter = appState.watch.selectedQuality;
        const filteredIndices = [];
        mirrors.forEach((m, idx) => {
          if (qFilter === "ALL" || String(m.quality || "").toLowerCase() === qFilter.toLowerCase()) {
            filteredIndices.push(idx);
          }
        });

        if (!filteredIndices.length) {
          container.innerHTML = `<span style="font-size:0.82rem; color:var(--text-muted);">Tidak ada server untuk kualitas ini.</span>`;
          return;
        }

        if (!filteredIndices.includes(appState.watch.selectedMirrorIdx)) {
          appState.watch.selectedMirrorIdx = filteredIndices[0];
        }

        container.innerHTML = filteredIndices.map((idx) => {
          const m = mirrors[idx];
          const active = idx === appState.watch.selectedMirrorIdx ? "active" : "";
          return `
            <button type="button" class="mirror-btn ${active}" data-mirror-idx="${idx}">
              ${esc(m.server || `Server ${idx + 1}`)} ${m.quality ? `• ${esc(m.quality)}` : ""} ${m.type ? `(${esc(m.type)})` : ""}
            </button>
          `;
        }).join("");

        container.querySelectorAll("[data-mirror-idx]").forEach((btn) => {
          btn.addEventListener("click", () => {
            appState.watch.selectedMirrorIdx = +btn.dataset.mirrorIdx;
            drawMirrorButtons();
            renderActivePlayer();
          });
        });
      }

      drawMirrorButtons();
      renderActivePlayer();

      const qChips = document.getElementById("qualityChips");
      if (qChips) {
        qChips.querySelectorAll("[data-quality]").forEach((btn) => {
          btn.addEventListener("click", () => {
            qChips.querySelectorAll(".mirror-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            appState.watch.selectedQuality = btn.dataset.quality;
            drawMirrorButtons();
            renderActivePlayer();
          });
        });
      }

      const fChips = document.getElementById("fallbackChips");
      if (fChips) {
        fChips.querySelectorAll("[data-host]").forEach((btn) => {
          btn.addEventListener("click", () => {
            fChips.querySelectorAll(".mirror-btn").forEach((b) => b.classList.remove("active"));
            btn.classList.add("active");
            appState.watch.selectedHost = btn.dataset.host;
            renderActivePlayer();
          });
        });
      }

      const modeBtn = document.getElementById("btnTogglePlayerMode");
      modeBtn.addEventListener("click", () => {
        const order = ["auto", "video", "iframe"];
        const labels = { auto: "Mode Player: Otomatis", video: "Mode Player: HTML5 Video", iframe: "Mode Player: Iframe Embed" };
        const next = order[(order.indexOf(appState.watch.forceMode) + 1) % order.length];
        appState.watch.forceMode = next;
        modeBtn.textContent = labels[next];
        renderActivePlayer();
      });

      document.getElementById("btnRefreshMirrors").addEventListener("click", async () => {
        const btn = document.getElementById("btnRefreshMirrors");
        btn.disabled = true;
        btn.textContent = "Memuat...";
        try {
          const r = await fetch(`/api/watch?slug=${encodeURIComponent(video.id)}&only=mirrors`);
          const j = await r.json();
          if (j.ok && j.data) {
            appState.watch.video.mirrors = j.data.mirrors || [];
            mirrors.length = 0;
            mirrors.push(...appState.watch.video.mirrors);
            drawMirrorButtons();
            renderActivePlayer();
          }
        } finally {
          btn.disabled = false;
          btn.textContent = "Muat Ulang Mirror";
        }
      });

      document.getElementById("btnLoadMoreComments").addEventListener("click", () => {
        if (appState.watch.nextCursor) {
          loadWatchComments(video.id, appState.watch.nextCursor, true);
        }
      });

      if (video.id) {
        loadWatchComments(video.id, null, false);
      }
    } catch (err) {
      renderError("Episode Tidak Dapat Dimuat", err.message);
    }
  }

  /* --------------------------------------------------- 4. DISCOVER & GENRES */

  async function ensureGenres() {
    if (appState.genres.length) return appState.genres;
    try {
      const res = await fetch("/api/discover?action=genres");
      const json = await res.json();
      if (json.ok && Array.isArray(json.genres)) {
        appState.genres = json.genres;
      }
    } catch (e) {}
    return appState.genres;
  }

  async function viewDiscover(params) {
    setActiveNav("discover");
    const genre = params.get("genre") || "";
    const status = params.get("status") || "";
    const type = params.get("type") || "";
    const order = params.get("order") || "";
    const season = params.get("season") || "";
    const studio = params.get("studio") || "";
    const page = Math.max(1, parseInt(params.get("page"), 10) || 1);

    renderSkeleton("Memuat Katalog & Genre Anime...");

    try {
      const genres = await ensureGenres();
      const qs = new URLSearchParams({
        action: genre && !status && !type && !order && !season && !studio ? "genre" : "list",
        genre,
        status,
        type,
        order,
        season,
        studio,
        page: String(page)
      });

      const res = await fetch(`/api/discover?${qs.toString()}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Gagal memuat katalog anime");

      const d = json.data;
      const items = (d.anime && d.anime.length) ? d.anime : (d.cards || []);

      root.innerHTML = `
        <div class="container">
          <div class="sec-head">
            <h2 class="sec-title">Jelajah Katalog &amp; Genre</h2>
            <span class="sec-sub">${genres.length} Genre Tersedia • Path: ${esc(d.path)}</span>
          </div>

          <form id="discoverFilterForm" class="filter-bar">
            <div class="filter-field">
              <label for="fGenre">Genre</label>
              <select id="fGenre">
                <option value="">Semua Genre</option>
                ${genres.map((g) => `<option value="${esc(g.slug)}" ${g.slug === genre ? "selected" : ""}>${esc(g.name)}${g.count ? ` (${g.count})` : ""}</option>`).join("")}
              </select>
            </div>
            <div class="filter-field">
              <label for="fStatus">Status</label>
              <select id="fStatus">
                <option value="">Semua Status</option>
                <option value="ongoing" ${status === "ongoing" ? "selected" : ""}>Ongoing</option>
                <option value="completed" ${status === "completed" ? "selected" : ""}>Completed</option>
              </select>
            </div>
            <div class="filter-field">
              <label for="fType">Tipe</label>
              <select id="fType">
                <option value="">Semua Tipe</option>
                <option value="TV" ${type === "TV" ? "selected" : ""}>TV</option>
                <option value="Movie" ${type === "Movie" ? "selected" : ""}>Movie</option>
                <option value="OVA" ${type === "OVA" ? "selected" : ""}>OVA</option>
                <option value="ONA" ${type === "ONA" ? "selected" : ""}>ONA</option>
                <option value="Special" ${type === "Special" ? "selected" : ""}>Special</option>
              </select>
            </div>
            <div class="filter-field">
              <label for="fOrder">Urutkan</label>
              <select id="fOrder">
                <option value="">Default</option>
                <option value="update" ${order === "update" ? "selected" : ""}>Update Terbaru</option>
                <option value="popular" ${order === "popular" ? "selected" : ""}>Terpopuler</option>
                <option value="rating" ${order === "rating" ? "selected" : ""}>Rating Tertinggi</option>
                <option value="title" ${order === "title" ? "selected" : ""}>Judul A–Z</option>
              </select>
            </div>
            <div class="filter-field">
              <label for="fSeason">Musim</label>
              <input id="fSeason" type="text" value="${esc(season)}" placeholder="Mis: fall-2025" />
            </div>
            <div class="filter-field">
              <label for="fStudio">Studio</label>
              <input id="fStudio" type="text" value="${esc(studio)}" placeholder="Mis: mappa" />
            </div>
            <button type="submit" class="btn-primary">Terapkan</button>
          </form>

          ${genres.length ? `
            <div class="genre-chips" style="margin-bottom:22px;">
              <a class="genre-chip ${!genre ? "active" : ""}" href="#discover">Semua</a>
              ${genres.slice(0, 24).map((g) => `<a class="genre-chip ${g.slug === genre ? "active" : ""}" href="#discover?genre=${encodeURIComponent(g.slug)}">${esc(g.name)}${g.count ? ` (${g.count})` : ""}</a>`).join("")}
            </div>
          ` : ""}

          ${items.length
            ? `<div class="anime-grid">${items.map((item) => renderCard(item, "anime")).join("")}</div>`
            : `<div class="state-box">Tidak ada anime ditemukan untuk kombinasi filter ini.</div>`
          }

          <div class="pagination-bar">
            <button type="button" class="btn-secondary ${d.page <= 1 ? "hidden" : ""}" id="btnDiscPrev">← Sebelumnya</button>
            <span class="page-pill">Halaman ${d.page}${d.totalPages ? ` / ${d.totalPages}` : ""}</span>
            <button type="button" class="btn-secondary ${d.totalPages && d.page >= d.totalPages ? "hidden" : ""}" id="btnDiscNext">Berikutnya →</button>
          </div>
        </div>
      `;

      function navigateDiscover(targetPage) {
        const next = new URLSearchParams();
        const vals = {
          genre: document.getElementById("fGenre").value,
          status: document.getElementById("fStatus").value,
          type: document.getElementById("fType").value,
          order: document.getElementById("fOrder").value,
          season: document.getElementById("fSeason").value.trim(),
          studio: document.getElementById("fStudio").value.trim()
        };
        Object.entries(vals).forEach(([k, v]) => { if (v) next.set(k, v); });
        if (targetPage > 1) next.set("page", String(targetPage));
        location.hash = `#discover${next.toString() ? "?" + next.toString() : ""}`;
      }

      document.getElementById("discoverFilterForm").addEventListener("submit", (e) => {
        e.preventDefault();
        navigateDiscover(1);
      });
      const prevBtn = document.getElementById("btnDiscPrev");
      if (prevBtn) prevBtn.addEventListener("click", () => navigateDiscover(d.page - 1));
      const nextBtn = document.getElementById("btnDiscNext");
      if (nextBtn) nextBtn.addEventListener("click", () => navigateDiscover(d.page + 1));
    } catch (err) {
      renderError("Katalog Gagal Dimuat", err.message);
    }
  }

  /* --------------------------------------------------- 5. SCHEDULE VIEW */

  async function viewSchedule() {
    setActiveNav("schedule");
    renderSkeleton("Memuat Jadwal Rilis Mingguan...");

    try {
      const res = await fetch("/api/schedule");
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Gagal memuat jadwal rilis");

      const sched = json.data;
      const dayKeys = ["mon", "tue", "wed", "thu", "fri", "sat", "sun", "end"];
      const jsDayToKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
      let activeKey = jsDayToKey[new Date().getDay()] || "mon";

      function drawDay() {
        const current = sched[activeKey] || { day: activeKey, anime: [] };
        const items = current.anime || [];
        document.getElementById("scheduleGrid").innerHTML = items.length
          ? items.map((a) => renderCard(a, "anime")).join("")
          : `<div class="state-box" style="grid-column:1/-1;">Belum ada jadwal rilis untuk hari ${esc(current.day)}.</div>`;

        document.querySelectorAll(".day-tab").forEach((t) => {
          t.classList.toggle("active", t.dataset.day === activeKey);
        });
      }

      root.innerHTML = `
        <div class="container">
          <div class="sec-head">
            <h2 class="sec-title">Jadwal Rilis Anime Mingguan</h2>
            <span class="sec-sub">Dikelompokkan Senin sampai Minggu + Tamat (END)</span>
          </div>
          <div class="day-tabs">
            ${dayKeys.map((k) => {
              const info = sched[k] || { day: k, anime: [] };
              const count = (info.anime || []).length;
              return `<button type="button" class="day-tab" data-day="${k}">${esc(info.day)} (${count})</button>`;
            }).join("")}
          </div>
          <div id="scheduleGrid" class="anime-grid"></div>
        </div>
      `;

      document.querySelectorAll(".day-tab").forEach((btn) => {
        btn.addEventListener("click", () => {
          activeKey = btn.dataset.day;
          drawDay();
        });
      });

      drawDay();
    } catch (err) {
      renderError("Jadwal Rilis Gagal Dimuat", err.message);
    }
  }

  /* --------------------------------------------------- 6. SEARCH VIEW */

  async function viewSearch(params) {
    setActiveNav("search");
    const q = params.get("q") || "";
    const mode = params.get("mode") || "json";
    const limit = params.get("limit") || "20";

    root.innerHTML = `
      <div class="container">
        <div class="sec-head">
          <h2 class="sec-title">Pencarian Anime (Dual-Mode)</h2>
          <span class="sec-sub">Pilih endpoint JSON API resmi (dengan limit kustom) atau HTML Scraper</span>
        </div>

        <form id="fullSearchForm" class="search-panel-card">
          <div class="search-form-row">
            <div class="filter-field">
              <label for="sQuery">Judul Anime</label>
              <input id="sQuery" type="search" value="${esc(q)}" placeholder="Contoh: One Piece, Solo Leveling, Naruto..." required />
            </div>
            <div class="filter-field">
              <label for="sMode">Mode Pencarian</label>
              <select id="sMode">
                <option value="json" ${mode === "json" ? "selected" : ""}>JSON API (/api/search)</option>
                <option value="html" ${mode === "html" ? "selected" : ""}>HTML Scraper (/?s=...)</option>
              </select>
            </div>
            <div class="filter-field">
              <label for="sLimit">Limit (JSON)</label>
              <select id="sLimit">
                <option value="10" ${limit === "10" ? "selected" : ""}>10 Hasil</option>
                <option value="20" ${limit === "20" ? "selected" : ""}>20 Hasil</option>
                <option value="30" ${limit === "30" ? "selected" : ""}>30 Hasil</option>
                <option value="50" ${limit === "50" ? "selected" : ""}>50 Hasil</option>
              </select>
            </div>
            <button type="submit" class="btn-primary" style="height:40px;">Cari</button>
          </div>
        </form>

        <div id="searchResultsWrap"></div>
      </div>
    `;

    document.getElementById("fullSearchForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const val = document.getElementById("sQuery").value.trim();
      const m = document.getElementById("sMode").value;
      const lim = document.getElementById("sLimit").value;
      if (!val) return;
      location.hash = `#search?q=${encodeURIComponent(val)}&mode=${encodeURIComponent(m)}&limit=${encodeURIComponent(lim)}`;
    });

    const wrap = document.getElementById("searchResultsWrap");
    if (!q) {
      wrap.innerHTML = `<div class="state-box">Masukkan judul anime di atas untuk mencari lewat JSON API atau HTML Scraper.</div>`;
      return;
    }

    wrap.innerHTML = `<div class="skeleton-grid">${Array(6).fill('<div class="skeleton-tile"></div>').join("")}</div>`;

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}&mode=${encodeURIComponent(mode)}&limit=${encodeURIComponent(limit)}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Pencarian gagal");

      const items = json.results || [];
      if (!items.length) {
        wrap.innerHTML = `<div class="state-box">Tidak ada hasil untuk "<strong>${esc(q)}</strong>" pada mode ${esc(mode.toUpperCase())}.</div>`;
        return;
      }

      wrap.innerHTML = `
        <div class="sec-head">
          <h3 class="sec-title">Hasil untuk "${esc(q)}" (${items.length})</h3>
          <span class="pill">${mode === "html" ? "HTML Scraper" : `JSON API (Limit ${limit})`}</span>
        </div>
        <div class="anime-grid">
          ${items.map((item) => renderCard(item, mode === "json" ? "anime" : item.type)).join("")}
        </div>
      `;
    } catch (err) {
      wrap.innerHTML = `<div class="state-box" style="color:var(--accent);">${esc(err.message)}</div>`;
    }
  }

  /* --------------------------------------------------- QUICK SEARCH TYPEAHEAD */

  const qsInput = document.getElementById("quickSearchInput");
  const qsDropdown = document.getElementById("quickSearchDropdown");
  let qsTimer = null;

  document.getElementById("quickSearchForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const val = qsInput.value.trim();
    qsDropdown.classList.add("hidden");
    if (val) location.hash = `#search?q=${encodeURIComponent(val)}&mode=json&limit=20`;
  });

  qsInput.addEventListener("input", () => {
    clearTimeout(qsTimer);
    const val = qsInput.value.trim();
    if (val.length < 2) {
      qsDropdown.classList.add("hidden");
      return;
    }
    qsTimer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}&mode=json&limit=6`);
        const json = await res.json();
        if (!json.ok || !json.results || !json.results.length) {
          qsDropdown.classList.add("hidden");
          return;
        }
        qsDropdown.innerHTML = json.results.map((r) => `
          <a class="qs-item" href="#anime/${encodeURIComponent(r.slug)}">
            ${imgTag(r.thumbnail || r.cover, r.title, "")}
            <div>
              <div class="qs-item-title">${esc(r.title)}</div>
              <div class="qs-item-meta">${esc(r.type || "Anime")} • ${esc(r.year || "—")} ${r.score ? `• ★ ${esc(r.score)}` : ""}</div>
            </div>
          </a>
        `).join("") + `
          <a class="qs-item" href="#search?q=${encodeURIComponent(val)}&mode=json&limit=20" style="justify-content:center; color:var(--accent); font-weight:700; font-size:0.82rem;">
            Lihat semua hasil untuk "${esc(val)}" →
          </a>
        `;
        qsDropdown.classList.remove("hidden");
      } catch (e) {
        qsDropdown.classList.add("hidden");
      }
    }, 320);
  });

  document.addEventListener("click", (e) => {
    if (!e.target.closest(".quick-search-wrap")) {
      qsDropdown.classList.add("hidden");
    }
  });

  /* --------------------------------------------------- URL / SLUG JUMP MODAL */

  const urlModal = document.getElementById("urlJumpModal");
  const urlFeedback = document.getElementById("urlJumpFeedback");

  document.getElementById("btnOpenUrlJump").addEventListener("click", () => {
    urlModal.classList.remove("hidden");
    urlFeedback.textContent = "";
    document.getElementById("urlJumpInput").focus();
  });
  document.getElementById("btnCloseUrlJump").addEventListener("click", () => urlModal.classList.add("hidden"));
  urlModal.addEventListener("click", (e) => { if (e.target === urlModal) urlModal.classList.add("hidden"); });

  document.getElementById("urlJumpForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const val = document.getElementById("urlJumpInput").value.trim();
    if (!val) return;
    urlFeedback.textContent = "Mendeteksi URL / Slug...";
    try {
      const res = await fetch(`/api/search?mode=resolve&q=${encodeURIComponent(val)}`);
      const json = await res.json();
      if (!json.ok) throw new Error(json.error || "Gagal mendeteksi slug");
      const { slug, kind } = json.data;
      urlModal.classList.add("hidden");
      location.hash = kind === "episode" ? `#watch/${encodeURIComponent(slug)}` : `#anime/${encodeURIComponent(slug)}`;
    } catch (err) {
      urlFeedback.textContent = err.message;
    }
  });

  /* --------------------------------------------------- HASH ROUTER */

  function handleRoute() {
    qsDropdown.classList.add("hidden");
    const raw = (location.hash || "#home").slice(1);
    const [pathPart, queryPart] = raw.split("?");
    const params = new URLSearchParams(queryPart || "");
    const segments = pathPart.split("/").filter(Boolean);
    const route = segments[0] || "home";
    const paramSlug = segments.slice(1).join("/");

    window.scrollTo({ top: 0, behavior: "instant" });

    if (route === "anime" && paramSlug) {
      viewAnime(decodeURIComponent(paramSlug));
    } else if (route === "watch" && paramSlug) {
      viewWatch(decodeURIComponent(paramSlug));
    } else if (route === "discover") {
      viewDiscover(params);
    } else if (route === "schedule") {
      viewSchedule();
    } else if (route === "search") {
      viewSearch(params);
    } else {
      viewHome(params);
    }
  }

  window.addEventListener("hashchange", handleRoute);
  handleRoute();
})();
