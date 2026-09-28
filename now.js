// "O que ver agora?": escolhe da fila pelo dia da semana, a hora,
// a duração e o clima do título (pesado x leve).

const DIAS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

// Gêneros do TMDB (filmes e séries usam alguns ids diferentes).
const HORROR = 27, THRILLER = 53, CRIME = 80, DRAMA = 18, WAR = 10752, MYSTERY = 9648;
const LIGHT = new Set([35, 16, 10751, 12, 14, 10749, 10402, 10759, 10762]);

export function isHeavy(m) {
  const g = m.genreIds || [];
  return g.includes(HORROR) || g.includes(THRILLER) || g.includes(WAR) || g.includes(CRIME)
    || (g.includes(DRAMA) && !g.includes(35)) || g.includes(MYSTERY);
}
export function isLight(m) {
  const g = m.genreIds || [];
  return g.some(x => LIGHT.has(x)) && !g.includes(HORROR) && !g.includes(THRILLER);
}

// Momento atual.
export function slotFor(d = new Date()) {
  const day = d.getDay(), h = d.getHours();
  const periodo = h < 5 ? "de madrugada" : h < 12 ? "de manhã" : h < 18 ? "à tarde" : "à noite";
  const label = `${DIAS[day]} ${periodo}`;
  let id;
  if (h >= 23 || h < 5) id = "madrugada";
  else if ((day === 5 || day === 6) && h >= 17) id = "fds_noite";
  else if (day === 6 || (day === 0 && h < 18)) id = "leve";
  else if (day === 0) id = "domingo_noite";
  else if (h >= 17) id = "semana_noite";
  else id = "pausa";
  return { id, label, day, hour: h };
}

const FRASE = {
  fds_noite: "Noite livre: hora do filmão, daqueles que pedem atenção total.",
  leve: "Clima de fim de semana: algo gostoso de ver sem esforço.",
  domingo_noite: "Pra fechar o fim de semana sem virar a noite.",
  semana_noite: "Cabe antes de dormir e prende sem cansar.",
  pausa: "Dá pra encaixar numa pausa do dia.",
  madrugada: "Já é tarde: algo curto.",
};

function mins(m) { return m.type === "tv" ? (m.epRuntime || null) : (m.runtime || null); }
export function durText(m) {
  const n = mins(m);
  if (!n) return m.type === "tv" ? "Série" : "Filme";
  if (m.type === "tv") return `Episódios de ~${n} min`;
  return `Filme de ${Math.floor(n / 60)}h${String(n % 60).padStart(2, "0")}`;
}

// Quanto o título combina com o momento. null = não combina.
function fit(m, slot) {
  const n = mins(m), tv = m.type === "tv", heavy = isHeavy(m), light = isLight(m);
  let s = 0;
  switch (slot.id) {
    case "fds_noite":
      if (!tv && n && n >= 105) s += 1.2;
      if (heavy) s += 0.8;
      if (tv) s += 0.2;
      break;
    case "leve":
      if (light) s += 1.3;
      if (heavy) s -= 1.0;
      if (!tv && n && n > 140) return null;
      break;
    case "domingo_noite":
      if (!tv && n && n > 125) return null;
      if (tv && n && n > 65) return null;
      if (m.genreIds && m.genreIds.includes(HORROR)) s -= 0.5;
      if (tv) s += 0.3;
      break;
    case "semana_noite":
      if (!tv && n && n > 130) return null;
      if (tv && n && n > 65) return null;
      if (!tv && n && n <= 110) s += 0.5;
      if (tv) s += 0.6;
      break;
    case "pausa":
      if (!tv && n && n > 105) return null;
      if (tv && n && n > 60) return null;
      if (tv && n && n <= 50) s += 1;
      if (light) s += 0.4;
      break;
    case "madrugada":
      if (!tv && n && n > 105) return null;
      if (tv && n && n > 50) return null;
      if (tv) s += 0.5;
      break;
  }
  if (!n) s -= 0.3; // sem duração conhecida: um pouco atrás
  return s;
}

// Lista ordenada do que mais combina agora (qualidade + encaixe no momento).
export function suggest(items, slot, quality) {
  const scored = [];
  for (const m of items) {
    const f = fit(m, slot);
    if (f === null) continue;
    scored.push({ m, score: quality(m) + f });
  }
  if (!scored.length) items.forEach(m => scored.push({ m, score: quality(m) }));
  scored.sort((a, b) => b.score - a.score);
  // Mistura os melhores pra não sugerir sempre o mesmo.
  const top = scored.slice(0, 8);
  for (let i = top.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    if (Math.abs(top[i].score - top[j].score) < 0.6) [top[i], top[j]] = [top[j], top[i]];
  }
  return top.concat(scored.slice(8)).map(x => x.m);
}

export function reason(m, slot) {
  return `${durText(m)} · ${FRASE[slot.id]}`;
}
