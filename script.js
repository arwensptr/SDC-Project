/* ============================================
   DASHBOARD ANALISIS — script.js
   ============================================ */

document.addEventListener('DOMContentLoaded', async () => {

  // Fungsi yang akan diisi setelah data siap — digunakan oleh theme toggle
  let _reRenderHeatmapTable = null;

  // ── 1. NAVIGASI ──────────────────────────────────────────────────
  const navItems = document.querySelectorAll('.nav-item');
  const pages = document.querySelectorAll('.page');

  navItems.forEach(btn => {
    btn.addEventListener('click', () => {
      const target = btn.dataset.page;
      navItems.forEach(n => n.classList.remove('active'));
      btn.classList.add('active');
      pages.forEach(p => p.classList.remove('active'));
      const targetPage = document.getElementById(`page-${target}`);
      if (targetPage) {
        targetPage.classList.add('active');

        // Biarkan browser render satu frame dulu (display:flex sudah aktif),
        // baru resize — ini mencegah Plotly membaca dimensi 0
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            targetPage.querySelectorAll('.js-plotly-plot').forEach(c => {
              Plotly.Plots.resize(c);
            });
          });
        });
      }
    });
  });

  // ── 2. TEMA (dark / light) ───────────────────────────────────────
  const themeToggle = document.getElementById('themeToggle');
  const html = document.documentElement;

  // Set tema awal
  const savedTheme = localStorage.getItem('dashboard-theme') || 'dark';
  html.setAttribute('data-theme', savedTheme);

  themeToggle.addEventListener('click', (e) => {
    e.preventDefault();
    const currentTheme = html.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';

    // Ubah atribut tema di root — CSS vars langsung berlaku (instan, tanpa transition di body)
    html.setAttribute('data-theme', newTheme);
    localStorage.setItem('dashboard-theme', newTheme);

    const textColor = newTheme === 'dark' ? '#f0f2f8' : '#111827';
    const gridColor = newTheme === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

    // Update SEMUA grafik di semua page (bukan hanya yang aktif)
    // agar saat pindah page tidak ada grafik yang masih pakai warna lama
    requestAnimationFrame(() => {
      document.querySelectorAll('.js-plotly-plot').forEach(c => {
        const currentLayout = c.layout || {};

        // Build relayout update — covers font, axes, legend, colorbar, annotations
        const relayoutUpdate = {
          'font.color': textColor,
          'paper_bgcolor': 'rgba(0,0,0,0)',
          'plot_bgcolor': 'rgba(0,0,0,0)',
          'xaxis.gridcolor': gridColor,
          'xaxis.zerolinecolor': gridColor,
          'xaxis.title.font.color': textColor,
          'xaxis.tickfont.color': textColor,
          'yaxis.gridcolor': gridColor,
          'yaxis.zerolinecolor': gridColor,
          'yaxis.title.font.color': textColor,
          'yaxis.tickfont.color': textColor,
          'legend.font.color': textColor
        };

        // Update yaxis2 jika ada (chart rating dual-axis)
        if (currentLayout.yaxis2) {
          relayoutUpdate['yaxis2.color'] = textColor;
          relayoutUpdate['yaxis2.title.font.color'] = textColor;
          relayoutUpdate['yaxis2.tickfont.color'] = textColor;
        }

        // Update semua annotations (heatmap korelasi) — ganti warna teks yg bukan putih
        if (currentLayout.annotations && currentLayout.annotations.length) {
          const updatedAnnotations = currentLayout.annotations.map(ann => {
            const newAnn = { ...ann };
            if (newAnn.font) {
              // Annotation pada korelasi: putih jika |r| > 0.45, else textColor
              const isWhite = newAnn.font.color === '#ffffff';
              if (!isWhite) {
                newAnn.font = { ...newAnn.font, color: textColor };
              }
            }
            return newAnn;
          });
          relayoutUpdate['annotations'] = updatedAnnotations;
        }

        Plotly.relayout(c, relayoutUpdate);

        // Restyle semua traces — text labels, outside text, colorbar
        const numTraces = (c.data || []).length;
        for (let i = 0; i < numTraces; i++) {
          const trace = c.data[i];
          const restyleUpdate = {};

          // Update text label warna (bar chart text di luar)
          if (trace.textfont) {
            restyleUpdate['textfont.color'] = textColor;
          }
          if (trace.outsidetextfont) {
            restyleUpdate['outsidetextfont.color'] = textColor;
          }

          // Update colorbar font jika ada (bubble chart, heatmap korelasi, choropleth)
          if (trace.marker && trace.marker.colorbar) {
            restyleUpdate['marker.colorbar.tickfont.color'] = textColor;
            restyleUpdate['marker.colorbar.title.font.color'] = textColor;
          }
          if (trace.colorbar) {
            restyleUpdate['colorbar.tickfont.color'] = textColor;
            restyleUpdate['colorbar.title.font.color'] = textColor;
          }

          if (Object.keys(restyleUpdate).length > 0) {
            Plotly.restyle(c, restyleUpdate, [i]);
          }
        }
      });

      // Re-render HTML heatmap table agar warna teks mengikuti tema baru
      if (typeof _reRenderHeatmapTable === 'function') {
        _reRenderHeatmapTable(textColor);
      }
    });
  });

  // ── 3. LIVE CLOCK ────────────────────────────────────────────────
  const dateEl = document.getElementById('live-date'); // <-- Ubah penargetan ke ID baru
  if (dateEl) {
    const updateDate = () => {
      const now = new Date();
      const dateStr = now.toLocaleDateString('id-ID', {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const timeStr = now.toLocaleTimeString('id-ID', {
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      dateEl.innerHTML = `<div style="display: flex; flex-direction: column; align-items: flex-end; line-height: 1.2;">
        <span>${dateStr}</span>
        <span style="font-size: 0.9em; font-weight: 600; margin-top: 2px;">${timeStr}</span>
      </div>`;
    };
    updateDate();
    setInterval(updateDate, 1000);
  }

  // ── 3b. DOWNLOAD MODAL ───────────────────────────────────────────
  const downloadModal = document.getElementById('downloadModal');
  const btnOpen = document.getElementById('btnOpenDownload');
  const btnClose = document.getElementById('btnCloseDownload');
  const btnDownloadCSV = document.getElementById('btnDownloadCSV');
  const downloadCount = document.getElementById('downloadCount');

  let _downloadData = [];   // will be set once allData is ready
  let _dlCluster = 'all';
  let _dlKategori = 'Penginapan';

  const populateTiers = (sektor) => {
    const tierContainer = document.getElementById('TierChips');
    if (!tierContainer) return;
    tierContainer.innerHTML = '<button class="chip active" data-type="Tier" data-value="all">Semua Tier</button>';
    if (sektor === 'all') return;

    const sectorData = _downloadData.filter(d => (d._sektor || '').toLowerCase() === sektor.toLowerCase());
    const uniqueTiers = [...new Set(sectorData.map(d => parseInt(d.tier)).filter(c => !isNaN(c)))].sort((a, b) => a - b);

    uniqueTiers.forEach(t => {
      const btn = document.createElement('button');
      btn.className = 'chip';
      btn.dataset.type = 'Tier';
      btn.dataset.value = t;
      btn.textContent = `Tier ${t}`;
      tierContainer.appendChild(btn);
    });
  };

  const updateDownloadCount = () => {
    const filtered = _downloadData.filter(d => {
      const clOk = _dlCluster === 'all' || String(d.tier) === String(_dlCluster);
      const katOk = _dlKategori === 'all' || (d._sektor || '').toLowerCase() === _dlKategori.toLowerCase();
      return clOk && katOk;
    });
    if (downloadCount) downloadCount.textContent = `${filtered.length.toLocaleString('id-ID')} baris data`;
    return filtered;
  };

  // Chip toggle
  document.querySelectorAll('.modal-chips').forEach(group => {
    group.addEventListener('click', e => {
      const chip = e.target.closest('.chip');
      if (!chip) return;

      const parent = chip.closest('.modal-chips');
      parent.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
      chip.classList.add('active');

      if (chip.dataset.type === 'Tier') {
        _dlCluster = chip.dataset.value;
      }
      if (chip.dataset.type === 'kategori') {
        _dlKategori = chip.dataset.value;
        _dlCluster = 'all'; // Reset tier when sector changes
        populateTiers(_dlKategori);
      }
      updateDownloadCount();
    });
  });

  if (btnOpen) btnOpen.addEventListener('click', () => { downloadModal.classList.add('open'); updateDownloadCount(); });
  if (btnClose) btnClose.addEventListener('click', () => downloadModal.classList.remove('open'));
  if (downloadModal) downloadModal.addEventListener('click', e => { if (e.target === downloadModal) downloadModal.classList.remove('open'); });

  if (btnDownloadCSV) {
    btnDownloadCSV.addEventListener('click', () => {
      const rows = updateDownloadCount();
      if (!rows.length) return alert('Tidak ada data yang sesuai filter.');
      const keys = Object.keys(rows[0]).filter(k => !k.startsWith('_')); // Exclude internal fields
      const csvLines = [
        keys.join(','),
        ...rows.map(r => keys.map(k => `"${(r[k] ?? '').toString().replace(/"/g, '""')}"`).join(','))
      ];
      const blob = new Blob([csvLines.join('\n')], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const clusterLabel = _dlCluster === 'all' ? 'semua-tier' : _dlCluster.toLowerCase().replace(/ /g, '-');
      const kategoriLabel = _dlKategori === 'all' ? 'semua-kategori' : _dlKategori.toLowerCase().replace(/ /g, '-');
      a.href = url; a.download = `data-bisnis-bali_${clusterLabel}_${kategoriLabel}.csv`;
      a.click(); URL.revokeObjectURL(url);
    });
  }

  // ── 4. DATA PIPELINE ─────────────────────────────────────────────
  const parseCSV = url => new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true, header: true, skipEmptyLines: true,
      complete: res => resolve(res.data),
      error: err => reject(err)
    });
  });

  const cfg = { responsive: true, displayModeBar: false };

  try {
    const [dataPenginapan, dataHiburan, dataRestoran, geojson] = await Promise.all([
      parseCSV('Penginapan.csv'),
      parseCSV('Hiburan_Malam.csv'),
      parseCSV('Restoran.csv'),
      fetch('kabupaten-bali.geojson').then(r => r.json())
    ]);

    dataPenginapan.forEach(d => (d._sektor = 'Penginapan'));
    dataRestoran.forEach(d => (d._sektor = 'Restoran'));
    dataHiburan.forEach(d => (d._sektor = 'Hiburan Malam'));

    const allData = [...dataPenginapan, ...dataRestoran, ...dataHiburan];
    _downloadData = allData; // Expose data to download modal
    populateTiers(_dlKategori); // Populate initial tiers for default sector


    const SEGMEN_LABEL = ['Rendah', 'Sedang', 'Tinggi', 'Tinggi Sekali'];
    // Palette Biru (Dari terang ke gelap)
    const BLUE_PALETTE = ['#E0F2FE', '#BAE6FD', '#7DD3FC', '#38BDF8', '#0EA5E9', '#0284C7', '#0369A1', '#075985'];
    const BLUE_6 = ['#E0F2FE', '#7DD3FC', '#0EA5E9', '#0284C7', '#0369A1', '#075985'];
    const BLUE_4 = ['#E0F2FE', '#38BDF8', '#0284C7', '#075985'];
    const BLUE_3 = ['#BAE6FD', '#0EA5E9', '#0369A1'];
    const SEGMEN_COLOR = BLUE_4;

    const BLUE_SCALE = [
      [0, '#E0F2FE'],
      [0.14, '#BAE6FD'],
      [0.28, '#7DD3FC'],
      [0.42, '#38BDF8'],
      [0.57, '#0EA5E9'],
      [0.71, '#0284C7'],
      [0.85, '#0369A1'],
      [1, '#075985']
    ];

    // Mapping cluster number → label segmentasi (hanya dipakai jika diperlukan fallback)
    const clusterToSegmen = (clusterStr) => {
      const n = parseInt(clusterStr);
      return SEGMEN_LABEL[n] ?? `Segmen ${n}`;
    };
    const KATEGORI = SEGMEN_LABEL;
    const SOSMED = ['Instagram', 'Tiktok', 'Facebook', 'YT'];
    const SOSMED_LBL = ['Instagram', 'TikTok', 'Facebook', 'YouTube'];

    // Menentukan kategori Segmentasi sesuai aturan mutlak dari jumlah sosmed + ota/odd per sektor
    allData.forEach(d => {
      if (d._sektor === 'Penginapan') {
        const val = parseInt(d.jumlah_sosmed_ota) || 0;
        if (val >= 19) d.kategori = 'Tinggi Sekali';
        else if (val >= 13) d.kategori = 'Tinggi';
        else if (val >= 7) d.kategori = 'Sedang';
        else d.kategori = 'Rendah';
      }
      else if (d._sektor === 'Restoran') {
        const val = parseInt(d.jumlah_sosmed_ODD) || 0;
        if (val >= 6) d.kategori = 'Tinggi Sekali';
        else if (val >= 4) d.kategori = 'Tinggi';
        else if (val >= 2) d.kategori = 'Sedang';
        else d.kategori = 'Rendah';
      }
      else if (d._sektor === 'Hiburan Malam') {
        const val = parseInt(d.jumlah_sosmed) || 0;
        if (val >= 3) d.kategori = 'Tinggi Sekali';
        else if (val >= 2) d.kategori = 'Tinggi';
        else if (val >= 1) d.kategori = 'Sedang';
        else d.kategori = 'Rendah';
      } else {
        d.kategori = 'Rendah'; // Fallback
      }
    });

    const sektorData = {
      'Penginapan': dataPenginapan,
      'Restoran': dataRestoran,
      'Hiburan Malam': dataHiburan
    };

    // ── KPI ──────────────────────────────────────────────────────────
    const totalUsaha = allData.length;
    const avgScore = allData.reduce((s, d) => s + (parseFloat(d.totalScore) || 0), 0) / totalUsaha;
    const reviewsArr = allData.map(d => parseInt(d.reviewsCount) || 0).sort((a, b) => a - b);
    const midIdx = Math.floor(reviewsArr.length / 2);
    const medReviewAll = reviewsArr.length % 2
      ? reviewsArr[midIdx]
      : (reviewsArr[midIdx - 1] + reviewsArr[midIdx]) / 2;
    const totalWebsite = allData.filter(d => d.website?.trim()).length;

    const animVal = (el, start, end, dur, fmt) => {
      if (!el) return;
      const t0 = performance.now();
      const tick = t => {
        const p = Math.min((t - t0) / dur, 1);
        el.textContent = fmt(start + (end - start) * (1 - Math.pow(1 - p, 3)));
        if (p < 1) requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    };

    animVal(document.getElementById('kpi-total'), 0, totalUsaha, 1200, v => Math.round(v).toLocaleString('id-ID'));
    animVal(document.getElementById('kpi-rating'), 0, avgScore, 1200, v => v.toFixed(2));
    animVal(document.getElementById('kpi-reviews'), 0, medReviewAll, 1200, v => Math.round(v).toLocaleString('id-ID'));
    animVal(document.getElementById('kpi-website'), 0, totalWebsite, 1200, v => Math.round(v).toLocaleString('id-ID'));

    // ── SETUP PLOTLY ─────────────────────────────────────────────────
    // Getter functions agar selalu membaca tema yang sedang aktif
    const getTextColor = () => html.getAttribute('data-theme') === 'dark' ? '#f0f2f8' : '#111827';
    const getGridColor = () => html.getAttribute('data-theme') === 'dark' ? 'rgba(255,255,255,0.07)' : 'rgba(0,0,0,0.07)';

    // Untuk backward-compat: variabel statis untuk initial render
    let textColor = getTextColor();
    let gridColor = getGridColor();

    // Base Layout dengan margin dan posisi legend yang diperbaiki
    // Diubah menjadi fungsi agar selalu mendapat warna terkini
    const getBaseLayout = () => {
      const tc = getTextColor();
      const gc = getGridColor();
      return {
        autosize: true,
        paper_bgcolor: 'rgba(0,0,0,0)',
        plot_bgcolor: 'rgba(0,0,0,0)',
        font: { family: 'Inter, sans-serif', color: tc },
        margin: { t: 40, b: 40, l: 50, r: 20 },
        xaxis: { gridcolor: gc, zerolinecolor: gc },
        yaxis: { gridcolor: gc, zerolinecolor: gc },
        showlegend: true,
        legend: { orientation: 'h', x: 0, y: 1.15, yanchor: 'bottom', font: { color: tc } }
      };
    };
    // Initial baseLayout snapshot (untuk chart yang hanya di-render sekali)
    const baseLayout = getBaseLayout();

    // ── HELPERS ───────────────────────────────────────────────────────
    const isTrue = (d, col) => String(d[col] ?? '').trim().toLowerCase() === 'true';

    const pct = (arr, col) => {
      if (!arr.length) return 0;
      return Math.round(arr.filter(d => isTrue(d, col)).length / arr.length * 100);
    };

    const pctWeb = arr =>
      arr.length ? Math.round(arr.filter(d => d.website?.trim()).length / arr.length * 100) : 0;

    const avg = (arr, col) =>
      arr.length ? arr.reduce((s, d) => s + (parseFloat(d[col]) || 0), 0) / arr.length : 0;

    const median = (arr, col) => {
      const sorted = arr.map(d => parseFloat(d[col]) || 0).sort((a, b) => a - b);
      const m = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[m] : (sorted[m - 1] + sorted[m]) / 2;
    };

    const renderHeatmapTable = (containerId, rows, cols, getData, getColor) => {
      const wrap = document.getElementById(containerId);
      if (!wrap) return;
      const colLabels = { website: 'WEBSITE', Instagram: 'INSTAGRAM', Tiktok: 'TIKTOK', Facebook: 'FACEBOOK', YT: 'YOUTUBE' };
      let markup = `<table class="hm-table">
        <thead><tr><th class="hm-row-label">SEKTOR</th>
        ${cols.map(c => `<th>${colLabels[c] ?? c.toUpperCase()}</th>`).join('')}
        </tr></thead><tbody>`;
      rows.forEach(row => {
        markup += `<tr><td class="hm-row-label">${row.label}</td>`;
        cols.forEach(col => {
          const val = getData(row, col);
          const { bg, fg } = getColor(val);
          markup += `<td><div class="hm-cell" title="${val}%" style="background:${bg};color:${fg};">${val}%</div></td>`;
        });
        markup += `</tr>`;
      });
      markup += `</tbody></table>`;
      wrap.innerHTML = markup;
    };

    const renderInsight = (id, title, points) => {
      const el = document.getElementById(id);
      const tmpl = document.getElementById('insight-template');
      if (!el || !tmpl) return;

      const clone = tmpl.content.cloneNode(true);
      clone.querySelector('.insight-title-text').textContent = title;

      const ul = clone.querySelector('.insight-list');
      points.forEach(p => {
        const li = document.createElement('li');
        li.innerHTML = p;
        ul.appendChild(li);
      });

      el.innerHTML = '';
      el.appendChild(clone);
    };

    // ═══════════════════════════════════════════════════════════════
    // PAGE 1 — RINGKASAN
    // ═══════════════════════════════════════════════════════════════

    if (document.getElementById('chart-medsos')) {
      const counts = SOSMED.map(col => allData.filter(d => isTrue(d, col)).length);
      const sortedData = counts.map((count, i) => ({ count, label: SOSMED_LBL[i] }))
        .sort((a, b) => a.count - b.count)
        .map((item, index) => ({ ...item, color: BLUE_4[index] }));

      Plotly.newPlot('chart-medsos', [{
        x: sortedData.map(d => d.label), y: sortedData.map(d => d.count), type: 'bar',
        marker: { color: sortedData.map(d => d.color) },
        text: sortedData.map(d => d.count.toLocaleString('id-ID')),
        textposition: 'outside', textfont: { color: textColor }
      }], { ...baseLayout, showlegend: false, yaxis: { ...baseLayout.yaxis, title: 'Jumlah Usaha' } }, cfg);
    }

    if (document.getElementById('chart-website')) {
      Plotly.newPlot('chart-website', [{
        values: [totalWebsite, totalUsaha - totalWebsite],
        labels: ['Punya Website', 'Tanpa Website'],
        type: 'pie',
        hole: 0.4,

        // --- PERBAIKAN: Mengecilkan Ukuran Pie ---
        domain: { x: [0.15, 0.85], y: [0.15, 0.85] },
        // ----------------------------------------

        rotation: 1,
        marker: { colors: [BLUE_4[1], BLUE_4[3]] },
        textinfo: 'percent+label',
        textposition: 'outside',
        automargin: true, // PENTING: Agar label di luar tidak terpotong
        insidetextfont: { color: ['#111827', '#ffffff'], size: 10 },
        outsidetextfont: { color: textColor, size: 11 }
      }], {
        ...baseLayout,
        margin: { t: 40, b: 40, l: 40, r: 40 }, // Sesuaikan margin agar tidak terlalu mepet
        showlegend: false
      }, cfg);
    }

    const hmRows = [
      { label: 'Penginapan', data: dataPenginapan },
      { label: 'Restoran', data: dataRestoran },
      { label: 'Hiburan Malam', data: dataHiburan }
    ];

    // Fungsi re-render heatmap table yang bisa dipanggil ulang saat ganti tema
    _reRenderHeatmapTable = (tc) => {
      renderHeatmapTable('heatmap-adopsi', hmRows, ['website', ...SOSMED],
        (row, col) => col === 'website' ? pctWeb(row.data) : pct(row.data, col),
        val => {
          const a = 0.1 + (val / 100) * 0.75;
          const bg = `rgba(14, 165, 233, ${a.toFixed(2)})`;
          const fg = val / 100 > 0.55 ? '#ffffff' : tc;
          return { bg, fg };
        }
      );
    };
    _reRenderHeatmapTable(textColor);

    const sosmedCounts = SOSMED.map(col => allData.filter(d => isTrue(d, col)).length);
    const topSosmedIdx = sosmedCounts.indexOf(Math.max(...sosmedCounts));
    const websitePct = Math.round(totalWebsite / totalUsaha * 100);
    const penIg = pct(dataPenginapan, 'Instagram');
    const penFb = pct(dataPenginapan, 'Facebook');

    renderInsight('insight-ringkasan', 'Sorotan Utama Eksekutif', [
      `Terdapat <strong>${totalUsaha.toLocaleString('id-ID')} entitas usaha</strong> pariwisata yang tercatat di wilayah Bali, dengan membukukan nilai rata-rata ulasan sebesar <strong>${avgScore.toFixed(2)} / 5.0</strong>.`,
      `<strong>Instagram</strong> mendominasi lanskap media sosial dengan <strong>${sosmedCounts[topSosmedIdx].toLocaleString('id-ID')} entitas pengguna aktif</strong>, yang kemudian diikuti oleh platform Facebook.`,
      `Sektor <strong>Penginapan</strong> mencatatkan tingkat adopsi digital tertinggi, dengan penetrasi Instagram mencapai <strong>${penIg}%</strong> dan Facebook sebesar <strong>${penFb}%</strong>.`,
      `Tingkat kepemilikan situs web aktif terpantau rendah di angka <strong>${websitePct}%</strong>, mengindikasikan tingginya tingkat ketergantungan pelaku usaha pada platform media sosial dan ekosistem pihak ketiga.`
    ]);

    // ═══════════════════════════════════════════════════════════════
    // PAGE 2 — ANALISIS & SEGMENTASI (gabungan)
    // ═══════════════════════════════════════════════════════════════

    const renderSegmentasiPage = (sektorName) => {
      const tc = getTextColor();
      const currentBaseLayout = getBaseLayout();

      const isAll = sektorName === 'Semua';
      const scopedData = isAll ? allData : allData.filter(d => d._sektor === sektorName);

      if (document.getElementById('chart-distribusi')) {
        const katCounts = SEGMEN_LABEL.map(kat => scopedData.filter(d => d.kategori === kat).length);
        Plotly.react('chart-distribusi', [{
          values: katCounts, labels: SEGMEN_LABEL, type: 'pie', hole: 0.44,
          marker: { colors: SEGMEN_COLOR }, textinfo: 'percent', textposition: 'auto', sort: false,
          insidetextfont: { color: ['#111827', '#111827', '#ffffff', '#ffffff'], size: 16, family: 'Inter, sans-serif' },
          outsidetextfont: { color: tc, size: 16, family: 'Inter, sans-serif' }
        }], {
          ...currentBaseLayout,
          margin: { t: 10, b: 40, l: 10, r: 10 },
          showlegend: true,
          legend: { orientation: 'h', x: 0.5, y: -0.2, xanchor: 'center', font: { color: tc } }
        }, cfg);
      }

      if (document.getElementById('chart-kategori-sosmed')) {
        const counts = SOSMED.map(col => scopedData.filter(d => String(d[col]).trim().toLowerCase() === 'true').length);
        const sortedData = counts.map((count, i) => ({ count, label: SOSMED_LBL[i] }))
          .sort((a, b) => a.count - b.count)
          .map((item, index) => ({ ...item, color: BLUE_4[index] }));

        Plotly.react('chart-kategori-sosmed', [{
          x: sortedData.map(d => d.label), y: sortedData.map(d => d.count), type: 'bar',
          marker: { color: sortedData.map(d => d.color) },
          text: sortedData.map(d => d.count.toLocaleString('id-ID')),
          textposition: 'outside', textfont: { color: tc }
        }], {
          ...currentBaseLayout, showlegend: false,
          xaxis: { ...currentBaseLayout.xaxis, title: 'Platform Media Sosial' },
          yaxis: { ...currentBaseLayout.yaxis, title: 'Jumlah Pengguna' }
        }, cfg);
      }

      const bestKat = SEGMEN_LABEL.reduce((best, kat) => {
        const s = avg(scopedData.filter(d => d.kategori === kat), 'totalScore');
        return s > best.score ? { kat, score: s } : best;
      }, { kat: '—', score: 0 });

      const igPerKat = SEGMEN_LABEL.map(kat => pct(scopedData.filter(d => d.kategori === kat), 'Instagram'));
      const topIgKatIdx = igPerKat.indexOf(Math.max(...igPerKat));
      const pctSedang = Math.round(scopedData.filter(d => d.kategori === 'Sedang').length / scopedData.length * 100) || 0;
      const pctRendah = Math.round(scopedData.filter(d => d.kategori === 'Rendah').length / scopedData.length * 100) || 0;

      const insightText = [

        `Berdasarkan distribusi segmentasi, mayoritas entitas usaha masih terkonsentrasi pada segmen Sedang (<strong>${pctSedang}%</strong>) dan segmen Rendah (<strong>${pctRendah}%</strong>).`,
        `<strong>Pembagian segmentasi berdasarkan jumlah sosmed + ota/odd:</strong><br>
        1. Penginapan:<br>
        &nbsp;&nbsp;&nbsp;- rendah (0-6)<br>
        &nbsp;&nbsp;&nbsp;- sedang (7-12)<br>
        &nbsp;&nbsp;&nbsp;- tinggi (13-18)<br>
        &nbsp;&nbsp;&nbsp;- sangat tinggi (19+)<br>
        2. Restoran:<br>
        &nbsp;&nbsp;&nbsp;- rendah (0-1)<br>
        &nbsp;&nbsp;&nbsp;- sedang (2-3)<br>
        &nbsp;&nbsp;&nbsp;- tinggi (4-5)<br>
        &nbsp;&nbsp;&nbsp;- sangat tinggi (6-7)<br>
        3. Hiburan Malam:<br>
        &nbsp;&nbsp;&nbsp;- rendah (0)<br>
        &nbsp;&nbsp;&nbsp;- sedang (1)<br>
        &nbsp;&nbsp;&nbsp;- tinggi (2)<br>
        &nbsp;&nbsp;&nbsp;- sangat tinggi (3-4)`
      ];

      const cardOta = document.getElementById('card-ota');
      const gridRow2 = document.getElementById('grid-analisis-row2');
      if (cardOta && gridRow2) {
        if (sektorName === 'Restoran' || isAll) {
          cardOta.style.display = 'block';
          gridRow2.style.gridTemplateColumns = '1fr 1fr';

          const dRes = isAll ? dataRestoran : scopedData;
          const otaCols = ['ShopeeFood', 'GrabFood', 'GoFood'];
          const otaCounts = otaCols.map(col => dRes.filter(d => isTrue(d, col)).length);

          const otaData = otaCols.map((col, i) => ({ col, count: otaCounts[i] }))
            .sort((a, b) => a.count - b.count)
            .map((item, i) => ({ ...item, color: BLUE_3[i] }));

          const otaPcts = otaData.map(d => `${Math.round(d.count / dRes.length * 100)}%`);

          if (document.getElementById('chart-ota')) {
            Plotly.react('chart-ota', [{
              x: otaData.map(d => d.col), y: otaData.map(d => d.count), type: 'bar',
              marker: { color: otaData.map(d => d.color) },
              text: otaPcts, textposition: 'outside', textfont: { color: tc, size: 13 }
            }], {
              ...currentBaseLayout, showlegend: false,
              xaxis: { ...currentBaseLayout.xaxis, title: 'Platform' },
              yaxis: { ...currentBaseLayout.yaxis, title: `Restoran (n=${dRes.length})` }
            }, cfg);
          }

          const sfPct = Math.round(dRes.filter(d => isTrue(d, 'ShopeeFood')).length / dRes.length * 100) || 0;
          const gfPct = Math.round(dRes.filter(d => isTrue(d, 'GrabFood')).length / dRes.length * 100) || 0;
          insightText.push(`Tinjauan spesifik pada sektor restoran mengindikasikan tingkat pemanfaatan platform layanan pesan-antar masih berada pada tahap suboptimal (ShopeeFood: <strong>${sfPct}%</strong>, GrabFood: <strong>${gfPct}%</strong>), merepresentasikan potensi pasar yang belum tergarap maksimal.`);
        } else {
          cardOta.style.display = 'none';
          gridRow2.style.gridTemplateColumns = '1fr';
        }
      }

      renderInsight('insight-analisis', `Tinjauan Analisis Segmentasi: ${isAll ? 'Semua Sektor' : sektorName}`, insightText);
    };

    renderSegmentasiPage('Semua');



    // ── CITY MAP (shared antara clustering & spasial) ────────────
    const cityMap = {
      'Badung Regency': 'BADUNG', 'BADUNG SELATAN': 'BADUNG',
      'Denpasar City': 'DENPASAR', 'Denpasar': 'DENPASAR',
      'Denpasar Barat': 'DENPASAR', 'denpasar/pamogan': 'DENPASAR',
      'Bali': 'BADUNG', 'Gianyar Regency': 'GIANYAR',
      'Jembrana Regency': 'JEMBRANA', 'Karangasem Regency': 'KARANGASEM',
      'Buleleng Regency': 'BULELENG', 'Tabanan Regency': 'TABANAN',
      'Bangli Regency': 'BANGLI', 'Klungkung Regency': 'KLUNGKUNG',
      'Tuban': 'BADUNG', 'pemecutan': 'DENPASAR',
      'Singaraja': 'BULELENG', 'Singraja': 'BULELENG'
    };

    // ── PAGE 3 — CLUSTERING ───────────────────────────────────────
    const renderClusteringPage = (sektorName) => {
      const tc = getTextColor();
      const currentBaseLayout = getBaseLayout();

      const sectorData = allData.filter(d => d._sektor === sektorName);
      const uniqueTiers = [...new Set(sectorData.map(d => parseInt(d.tier)).filter(c => !isNaN(c)))].sort((a, b) => a - b);
      const KATEGORI_SEKTOR = uniqueTiers.map(c => `Tier ${c}`);

      // Dynamic color palette (menggunakan warna vibrant agar lebih kontras dan sangat jelas terlihat)
      const colorPalette = ['#ef4444', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899', '#14b8a6'];
      const availableSymbols = ['circle', 'square', 'diamond', 'cross', 'triangle-up', 'star', 'hexagon'];
      const tierColors = {};
      const tierNumMap = {};
      const tierSymbols = {};
      KATEGORI_SEKTOR.forEach((k, i) => {
        tierColors[k] = colorPalette[i % colorPalette.length];
        tierNumMap[k] = uniqueTiers[i];
        tierSymbols[k] = availableSymbols[i % availableSymbols.length];
      });

      const highMedia = sectorData.filter(d => SOSMED.reduce((a, c) => a + (isTrue(d, c) ? 1 : 0), 0) >= 3);
      const zeroMedia = sectorData.filter(d => SOSMED.every(c => !isTrue(d, c)));
      const highAvg = avg(highMedia, 'totalScore');
      const zeroAvg = avg(zeroMedia, 'totalScore');
      const highRev = median(highMedia, 'reviewsCount');
      const zeroRev = median(zeroMedia, 'reviewsCount');

      const distText = KATEGORI_SEKTOR.map(kat => `${kat} <strong>${sectorData.filter(d => parseInt(d.tier) === tierNumMap[kat]).length}</strong>`).join(', ');

      renderInsight('insight-clustering', `Interpretasi Hasil Tiering: ${sektorName}`, [
        `Analisis segmentasi tier divisualisasikan dengan mempertimbangkan beberapa variabel fundamental, meliputi: kepemilikan nomor telepon, situs web, serta agregasi pemanfaatan platform media sosial dan OTA.`,
        `Entitas usaha yang mengelola <strong>minimal 3 platform digital secara aktif</strong> menunjukkan korelasi positif terhadap kepuasan konsumen, dengan rata-rata rating mencapai <strong>${highAvg.toFixed(2)}</strong> dan nilai tengah ulasan sebanyak <strong>${Math.round(highRev).toLocaleString('id-ID')}</strong>.`,
        `Sebaliknya, entitas <strong>tanpa presensi media sosial</strong> cenderung mencatatkan performa di bawah standar optimal, dengan capaian rating <strong>${zeroAvg.toFixed(2)}</strong> dan nilai tengah ulasan terbatas pada <strong>${Math.round(zeroRev).toLocaleString('id-ID')}</strong>.`,
        `Ringkasan distribusi populasi per tier dijabarkan sebagai berikut: ${distText}.`
      ]);

      if (document.getElementById('chart-rating')) {
        const avgScores = KATEGORI_SEKTOR.map(kat => {
          const sub = sectorData.filter(d => parseInt(d.tier) === tierNumMap[kat]);
          return sub.length ? parseFloat(avg(sub, 'totalScore').toFixed(2)) : 0;
        });
        const medRevs = KATEGORI_SEKTOR.map(kat => {
          const sub = sectorData.filter(d => parseInt(d.tier) === tierNumMap[kat]);
          return sub.length ? parseInt(median(sub, 'reviewsCount')) : 0;
        });

        Plotly.react('chart-rating', [
          { x: KATEGORI_SEKTOR, y: avgScores, name: 'Avg Rating', type: 'bar', marker: { color: BLUE_4[0] } },
          { x: KATEGORI_SEKTOR, y: medRevs, name: 'Med Reviews', type: 'bar', yaxis: 'y2', marker: { color: BLUE_4[3] } }
        ], {
          ...currentBaseLayout, barmode: 'group', showlegend: true,
          margin: { t: 40, b: 40, l: 50, r: 60 },
          yaxis: { ...currentBaseLayout.yaxis, title: 'Rating (0-5)' },
          yaxis2: { title: 'Reviews', overlaying: 'y', side: 'right', showgrid: false, color: tc }
        }, cfg);
      }

      if (document.getElementById('chart-bubble')) {
        const bubbleTraces = KATEGORI_SEKTOR.map(kat => {
          const subset = sectorData.filter(d => parseInt(d.tier) === tierNumMap[kat]);

          const subScores = subset.map(d => (parseFloat(d.totalScore) || 0) + (Math.random() * 0.06 - 0.03));
          const subReviews = subset.map(d => Math.max(1, parseInt(d.reviewsCount) || 1));
          const subSosmed = subset.map(d => SOSMED.reduce((a, c) => a + (String(d[c]).trim().toLowerCase() === 'true' ? 1 : 0), 0));

          return {
            x: subScores,
            y: subReviews,
            mode: 'markers',
            name: kat,
            text: subset.map(d => `${d.title || 'Unknown'}<br>Platform Aktif: ${subSosmed[subset.indexOf(d)]}`),
            marker: {
              size: 9,
              color: subSosmed,
              symbol: tierSymbols[kat],
              coloraxis: 'coloraxis',
              opacity: 0.85
            }
          };
        });

        Plotly.react('chart-bubble', bubbleTraces, {
          ...currentBaseLayout,
          showlegend: true,
          coloraxis: {
            colorscale: 'Viridis',
            colorbar: { title: 'Platform', tickfont: { color: tc }, titlefont: { color: tc } },
            cmin: 0,
            cmax: SOSMED.length
          },
          xaxis: {
            ...currentBaseLayout.xaxis,
            title: 'Total Score',
            type: 'linear',
            tickmode: 'linear',
            autorange: false,
            range: [-0.2, 5.2],
            dtick: 0.5
          },
          yaxis: { ...currentBaseLayout.yaxis, title: 'Reviews', type: 'log' },
          legend: { ...currentBaseLayout.legend }
        }, cfg);
      }

      // ── CHART: HASIL TIERING (Scatter Plot) ──────────────────────
      if (document.getElementById('chart-cluster')) {
        const tierTraces = KATEGORI_SEKTOR.map(kat => {
          const subset = sectorData.filter(d => parseInt(d.tier) === tierNumMap[kat]);
          return {
            x: subset.map(d => (parseFloat(d.totalScore) || 0) + (Math.random() * 0.06 - 0.03)),
            y: subset.map(d => Math.max(1, parseInt(d.reviewsCount) || 1)),
            mode: 'markers',
            name: kat,
            text: subset.map(d => `${d.title || 'N/A'}<br>Sektor: ${d._sektor}<br>Rating: ${d.totalScore}<br>Reviews: ${d.reviewsCount}`),
            hoverinfo: 'text',
            marker: {
              color: tierColors[kat],
              symbol: tierSymbols[kat],
              size: 9,
              opacity: 0.85,
              line: { width: 1, color: 'rgba(255,255,255,0.4)' }
            }
          };
        });

        Plotly.react('chart-cluster', tierTraces, {
          ...currentBaseLayout,
          xaxis: { ...currentBaseLayout.xaxis, title: 'Total Score', type: 'linear', tickmode: 'linear', range: [-0.2, 5.5], dtick: 1 },
          yaxis: { ...currentBaseLayout.yaxis, title: 'Jumlah Reviews', type: 'log' },
          legend: { ...currentBaseLayout.legend }
        }, cfg);
      }

      // ── CHART: HEATMAP KORELASI CLUSTER & FITUR ─────────────────
      if (document.getElementById('chart-corr-heatmap')) {
        const parseRobust = (val) => {
          if (val === true || val === 'True' || val === 'true') return 1;
          if (val === false || val === 'False' || val === 'false') return 0;
          if (val === null || val === undefined || val === '') return NaN;
          const parsed = parseFloat(val);
          return isNaN(parsed) ? NaN : parsed;
        };

        const features = {
          'Total Score': sectorData.map(d => parseRobust(d.totalScore)),
          'Reviews Count': sectorData.map(d => parseRobust(d.reviewsCount)),
          'Jumlah Sosmed': sectorData.map(d => parseRobust(d.jumlah_sosmed_ota ?? d.jumlah_sosmed_ODD ?? d.jumlah_sosmed)),
          'Has Website': sectorData.map(d => parseRobust(d.has_website)),
          'Has Phone': sectorData.map(d => parseRobust(d.has_phone))
        };

        const featureNames = Object.keys(features);
        const nFeat = featureNames.length;

        // Pearson correlation with Pairwise Deletion (matches Pandas df.corr)
        const pearson = (x_full, y_full) => {
          const x = [];
          const y = [];
          for (let i = 0; i < x_full.length; i++) {
            if (!isNaN(x_full[i]) && !isNaN(y_full[i])) {
              x.push(x_full[i]);
              y.push(y_full[i]);
            }
          }
          const len = x.length;
          if (len === 0) return 0;

          const mx = x.reduce((a, b) => a + b, 0) / len;
          const my = y.reduce((a, b) => a + b, 0) / len;
          let num = 0, dx2 = 0, dy2 = 0;
          for (let i = 0; i < len; i++) {
            const dxi = x[i] - mx, dyi = y[i] - my;
            num += dxi * dyi; dx2 += dxi * dxi; dy2 += dyi * dyi;
          }
          const den = Math.sqrt(dx2 * dy2);
          return den === 0 ? 0 : num / den;
        };

        const corrMatrix = [];
        for (let i = 0; i < nFeat; i++) {
          const row = [];
          for (let j = 0; j < nFeat; j++) {
            row.push(parseFloat(pearson(features[featureNames[i]], features[featureNames[j]]).toFixed(3)));
          }
          corrMatrix.push(row);
        }

        const corrAnnotations = [];
        for (let i = 0; i < nFeat; i++) {
          for (let j = 0; j < nFeat; j++) {
            corrAnnotations.push({
              x: featureNames[j], y: featureNames[i],
              text: corrMatrix[i][j].toFixed(2),
              font: { color: Math.abs(corrMatrix[i][j]) > 0.45 ? '#ffffff' : tc, size: 10 },
              showarrow: false
            });
          }
        }

        Plotly.react('chart-corr-heatmap', [{
          z: corrMatrix, x: featureNames, y: featureNames,
          type: 'heatmap', colorscale: BLUE_SCALE,
          zmin: -1, zmax: 1, showscale: true,
          colorbar: { tickfont: { color: tc }, title: { text: 'r', font: { color: tc } }, thickness: 12, len: 0.8, xpad: 15 }
        }], {
          ...currentBaseLayout, showlegend: false,
          annotations: corrAnnotations,
          xaxis: { ...currentBaseLayout.xaxis, side: 'bottom', tickangle: -45 },
          yaxis: { ...currentBaseLayout.yaxis, autorange: 'reversed' },
          margin: { t: 40, b: 110, l: 110, r: 60 }
        }, cfg);
      }


    }; // End renderClusteringPage

    // Initialize pages
    renderClusteringPage('Penginapan');

    const setupFilter = (filterId, renderFn) => {
      const filterEl = document.getElementById(filterId);
      if (filterEl) {
        const btns = filterEl.querySelectorAll('.segment-btn');
        btns.forEach(btn => {
          btn.addEventListener('click', (e) => {
            btns.forEach(b => {
              b.style.background = 'transparent';
              b.style.color = 'var(--text-muted)';
              b.classList.remove('active');
            });
            e.target.style.background = 'var(--accent-blue)';
            e.target.style.color = 'white';
            e.target.classList.add('active');

            requestAnimationFrame(() => {
              renderFn(e.target.getAttribute('data-value'));

              requestAnimationFrame(() => {
                const activePage = document.querySelector('.page.active');
                if (activePage) {
                  activePage.querySelectorAll('.js-plotly-plot').forEach(c => {
                    Plotly.Plots.resize(c);
                  });
                }
              });
            });
          });
        });
      }
    };

    setupFilter('analisis-sektor-filter', renderSegmentasiPage);
    setupFilter('tier-sektor-filter', renderClusteringPage);

    // ═══════════════════════════════════════════════════════════════
    // PAGE 4 — SPASIAL
    // ═══════════════════════════════════════════════════════════════

    // cityMap sudah didefinisikan di atas (shared)

    const wilCounts = {};
    allData.forEach(d => { const kab = cityMap[d.city]; if (kab) wilCounts[kab] = (wilCounts[kab] || 0) + 1; });

    if (document.getElementById('chart-heatmap')) {
      const tW = Object.keys(wilCounts), tZ = Object.values(wilCounts);

      Plotly.newPlot('chart-heatmap', [{
        type: 'choropleth', geojson: geojson, locations: tW,
        featureidkey: 'properties.nm_kabkota', z: tZ,
        colorscale: BLUE_SCALE,
        text: tW.map((w, i) => `<b>${w}</b><br>Usaha: ${tZ[i].toLocaleString('id-ID')}`),
        hoverinfo: 'text', showscale: true,
        colorbar: { tickfont: { color: textColor } }
      }], {
        ...baseLayout,
        geo: { fitbounds: 'locations', visible: false, bgcolor: 'rgba(0,0,0,0)' },
        margin: { t: 0, b: 0, l: 0, r: 0 }
      }, cfg);
    }



    if (document.getElementById('chart-top-kabupaten')) {
      const sorted = Object.entries(wilCounts).sort((a, b) => b[1] - a[1]);
      const topN = sorted.slice(0, 6);
      const totalTopN = topN.reduce((sum, [, v]) => sum + v, 0);

      Plotly.newPlot('chart-top-kabupaten', [{
        values: topN.map(([, v]) => v),
        labels: topN.map(([k]) => k),
        type: 'pie', hole: 0.05,
        rotation: 0,
        marker: { colors: BLUE_6.slice(0, topN.length).reverse() },
        textinfo: 'percent',

        textposition: "auto ",

        hoverinfo: 'label+percent+value',
        insidetextfont: { color: '#ffffff', size: 15 },
        outsidetextfont: { color: textColor, size: 12 }
      }], {
        ...baseLayout, showlegend: true,
        legend: { orientation: 'v', font: { color: textColor } },
        margin: { t: 40, b: 80, l: 40, r: 40 }
      }, cfg);
    }

    const sortedKab = Object.entries(wilCounts).sort((a, b) => b[1] - a[1]);
    const topKab = sortedKab[0];
    const top2 = sortedKab.slice(0, 2);
    const top2Pct = Math.round(top2.reduce((s, [, v]) => s + v, 0) / totalUsaha * 100);
    const bottomKab = sortedKab[sortedKab.length - 1];

    renderInsight('insight-spasial', 'Interpretasi Sebaran Peta', [
      `Analisis sebaran wilayah menunjukkan bahwa <strong>${topKab[0]}</strong> mempertahankan posisi dominannya sebagai sentra pariwisata utama di Bali, menaungi <strong>${topKab[1].toLocaleString('id-ID')} entitas usaha</strong>.`,
      `Terdapat konsentrasi yang masif di wilayah barat dan selatan, di mana dua kabupaten/kota teratas (<strong>${top2.map(([k]) => k).join(' & ')}</strong>) secara kumulatif merepresentasikan <strong>${top2Pct}%</strong> dari total keseluruhan populasi usaha.`,
      `Adapun <strong>${bottomKab[0]}</strong> membukukan jumlah populasi terendah (<strong>${bottomKab[1]} entitas</strong>), mengisyaratkan area ini memiliki potensi perluasan dan pengembangan kapasitas usaha yang signifikan di masa depan.`
    ]);

    // ═══════════════════════════════════════════════════════════════
    // PAGE 5 — REKOMENDASI
    // ═══════════════════════════════════════════════════════════════

    const recoContainer = document.getElementById('reco-container');
    if (recoContainer) {
      const websitePct = Math.round(totalWebsite / totalUsaha * 100);
      const noWebPct = 100 - websitePct;
      const tikPct = pct(allData, 'Tiktok');
      const ytPct = pct(allData, 'YT');
      const restoIgPct = pct(dataRestoran, 'Instagram');
      const hibIgPct = pct(dataHiburan, 'Instagram');
      const penIg = pct(dataPenginapan, 'Instagram');
      const penFb = pct(dataPenginapan, 'Facebook');
      const sfPct = pct(dataRestoran, 'ShopeeFood');
      const gfPct = pct(dataRestoran, 'GrabFood');
      const goFPct = Math.round(dataRestoran.filter(d => isTrue(d, 'GoFood')).length / dataRestoran.length * 100);
      const pctRendah = Math.round(allData.filter(d => d.kategori === 'Rendah').length / allData.length * 100);
      const with3Plus = allData.filter(d => (parseInt(d.jumlah_sosmed) || 0) + (parseInt(d.jumlah_sosmed_ODD) || 0) >= 3);
      const zeroMedsos = allData.filter(d => (parseInt(d.jumlah_sosmed) || 0) + (parseInt(d.jumlah_sosmed_ODD) || 0) === 0);
      const highAvg = with3Plus.reduce((s, d) => s + (parseFloat(d.rating) || 0), 0) / (with3Plus.length || 1);
      const zeroAvg = zeroMedsos.reduce((s, d) => s + (parseFloat(d.rating) || 0), 0) / (zeroMedsos.length || 1);

      const kabPctList = sortedKab.map(([kab, cnt]) => {
        const kabData = allData.filter(d => cityMap[d.city] === kab);
        const igPct = pct(kabData, 'Instagram');
        return { kab, cnt, igPct };
      }).sort((a, b) => a.igPct - b.igPct);
      const lowestDigKab = kabPctList[0];

      const recommendations = [
        {
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="2" width="14" height="20" rx="2" ry="2"></rect><line x1="12" y1="18" x2="12.01" y2="18"></line></svg>',
          title: 'Sinergi Promosi Media Sosial & Kualitas Layanan', priority: 'high', priorityLabel: 'Fokus Pelaku Usaha',
          desc: `Promosi digital efektif meningkatkan jumlah ulasan dan volume pengunjung. Namun, <strong>rating murni dipengaruhi oleh kualitas layanan</strong> di lapangan. Oleh karena itu, manfaatkan media sosial sebagai mesin pendatang pelanggan (akuisisi), namun pastikan terus berbenah meningkatkan layanan demi menjaga kepuasan pengunjung (retensi).`,
          metric: `Aktivitas medsos berbanding lurus dengan peningkatan ulasan (reviews), namun independen terhadap skor penilaian (rating).`
        },
        {
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><circle cx="12" cy="12" r="6"></circle><circle cx="12" cy="12" r="2"></circle></svg>',
          title: 'Rekomendasi Jangka Pendek (Penjangkauan & Pemetaan)', priority: 'high', priorityLabel: 'Prioritas Pemerintah',
          desc: `Manfaatkan model tiering untuk memetakan usaha di segmen literasi digital terendah. Lakukan pendekatan proaktif (jemput bola) untuk memberikan bantuan teknis dasar (seperti pembuatan titik lokasi peta & akun bisnis) sekaligus melakukan survei mendalam guna mengidentifikasi hambatan utama promosi digital mereka.`,
          metric: `Fokus: Pendataan spesifik dan pendampingan langsung pada klaster terbawah.`
        },
        {
          icon: '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"></path><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"></path></svg>',
          title: 'Rekomendasi Jangka Panjang (Edukasi & Keberlanjutan)', priority: 'medium', priorityLabel: 'Program Lanjutan',
          desc: `Kementerian Pariwisata perlu menyelenggarakan program pembinaan berkelanjutan agar pelaku usaha menguasai strategi promosi secara mandiri. Program harus diiringi dengan pendampingan berkala terhadap badan usaha prioritas, serta pembukaan pusat layanan terpadu (<em>helpdesk digital</em>) berbasis tautan daring untuk permohonan pendampingan operasional.`,
          metric: `Tujuan: Adopsi digital maksimal, engagement tinggi, dan kemandirian pelaku usaha.`
        }
      ];

      recoContainer.innerHTML = recommendations.map(r => `
        <div class="reco-card">
          <div class="reco-icon">${r.icon}</div>
          <div class="reco-title">${r.title}</div>
          <div class="reco-priority ${r.priority}">${r.priorityLabel}</div>
          <div class="reco-desc">${r.desc}</div>
          <div class="reco-metric">${r.metric}</div>
        </div>
      `).join('');
    }

    renderInsight('insight-rekomendasi', 'Tindak Lanjut & Intervensi Pemerintah', [
      `Temuan ini dapat menjadi landasan bagi Kementerian Pariwisata (Kemenpar) untuk mendorong roda ekonomi pariwisata yang lebih inklusif.`,
      `Pemerintah dapat memanfaatkan model tiering untuk pendataan dan pemetaan spesifik terhadap kelompok usaha yang masih memiliki kesadaran digital rendah (klaster terbawah).`,
      `Intervensi dapat difokuskan pada bantuan pembuatan aset digital dasar (seperti titik lokasi peta dan akun bisnis), sosialisasi presensi online, hingga pembinaan teknis merancang promosi efektif.`
    ]);

    // Global resize listener to ensure Plotly charts resize on window resize/orientation change
    window.addEventListener('resize', () => {
      document.querySelectorAll('.page.active .js-plotly-plot').forEach(c => {
        Plotly.Plots.resize(c);
      });
    });

  } catch (err) {
    console.error('Gagal memuat data:', err);
  }

});
