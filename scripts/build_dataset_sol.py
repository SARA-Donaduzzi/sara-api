"""Monta o dataset do experimento a partir dos registros OAI-PMH da SBC OpenLib.

Protocolo: corte temporal. Escolhido um ano-alvo T, as submissoes sao os
trabalhos publicados em T e o perfil de cada avaliador e construido apenas
com o que ele publicou ANTES de T. Isso reproduz a situacao real de uma
conferencia (existe um historico, chegam submissoes novas) e evita o
vazamento de vocabulario que o leave-one-out introduz.

Desambiguacao de autores: casamento exato sobre o nome normalizado. E uma
escolha conservadora — variantes abreviadas ("Cechinel, C." vs "Cechinel,
Cristian") ficam separadas, o que reduz o pool mas nao funde pessoas
distintas. O efeito da regra mais permissiva e reportado como sensibilidade.

Entrada : scripts/data/corpus-sol/records.json
Saida   : scripts/data/dataset-sol/{submissions,reviewers,stats}.json
"""

import argparse
import json
import re
import unicodedata
from collections import Counter, defaultdict
from pathlib import Path

BASE = Path(__file__).resolve().parent / "data"
SRC = BASE / "corpus-sol" / "records.json"
OUT = BASE / "dataset-sol"

MIN_ABSTRACT_WORDS = 25
LANG_PRIORITY = ["pt-BR", "pt_BR", "pt", "en-US", "en_US", "en", "es-ES", "es"]


def strip_accents(s: str) -> str:
    return unicodedata.normalize("NFKD", s).encode("ascii", "ignore").decode()


def pick(entries: list[dict]) -> tuple[str, str]:
    """Escolhe o texto de maior prioridade de idioma. Retorna (valor, idioma)."""
    if not entries:
        return "", ""
    for lang in LANG_PRIORITY:
        for e in entries:
            if e["lang"] == lang and e["value"]:
                return e["value"], lang
    return entries[0]["value"], entries[0]["lang"]


def pick_lang(entries: list[dict], lang_prefix: str) -> str:
    for e in entries:
        if e["lang"].lower().startswith(lang_prefix) and e["value"]:
            return e["value"]
    return ""


def extract_year(rec: dict) -> int | None:
    for d in rec.get("dates", []):
        m = re.search(r"(19|20)\d{2}", d)
        if m:
            return int(m.group(0))
    for s in rec.get("sources", []):
        m = re.search(r"(19|20)\d{2}", s)
        if m:
            return int(m.group(0))
    if rec.get("datestamp"):
        m = re.search(r"(19|20)\d{2}", rec["datestamp"])
        if m:
            return int(m.group(0))
    return None


def author_key(name: str) -> str | None:
    n = strip_accents(name).lower()
    n = re.sub(r"[^a-z, ]", " ", n)
    n = re.sub(r"\s+", " ", n).strip(" ,")
    if not n or len(n) < 5:
        return None
    parts = [p.strip() for p in n.split(",")]
    if len(parts) >= 2:
        surname, given = parts[0], " ".join(parts[1:])
    else:
        toks = n.split()
        if len(toks) < 2:
            return None
        surname, given = toks[-1], " ".join(toks[:-1])
    if not surname or not given:
        return None
    # descarta nomes reduzidos a iniciais dos dois lados
    if len(surname) < 3 or len(given.replace(" ", "")) < 2:
        return None
    return f"{surname}|{given}"


def display_name(key: str) -> str:
    surname, given = key.split("|")
    return f"{given.title()} {surname.title()}"


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--year", type=int, default=None, help="ano-alvo (default: melhor automatico)")
    ap.add_argument("--min-history", type=int, default=3, help="minimo de trabalhos previos por avaliador")
    ap.add_argument("--events", nargs="*", default=None, help="restringe a eventos")
    args = ap.parse_args()

    OUT.mkdir(parents=True, exist_ok=True)
    records = json.loads(SRC.read_text(encoding="utf-8"))
    if args.events:
        records = [r for r in records if r["event"] in args.events]

    # ---------------------------------------------------------- normalizacao
    docs = []
    for r in records:
        title, title_lang = pick(r["titles"])
        abstract, abstract_lang = pick(r["descriptions"])
        year = extract_year(r)
        if not title or len(title.split()) < 3:
            continue
        if len(abstract.split()) < MIN_ABSTRACT_WORDS:
            continue
        if year is None:
            continue
        keys = []
        for c in r["creators"]:
            k = author_key(c)
            if k and k not in keys:
                keys.append(k)
        if not keys:
            continue
        docs.append(
            {
                "id": r["identifier"].rsplit("/", 1)[-1],
                "event": r["event"],
                "year": year,
                "title": title,
                "title_lang": title_lang,
                "title_en": pick_lang(r["titles"], "en"),
                "abstract": abstract,
                "abstract_lang": abstract_lang,
                "keywords": "; ".join(r["subjects"]),
                "author_keys": keys,
            }
        )

    by_year = Counter(d["year"] for d in docs)
    papers_by_author: dict[str, list[dict]] = defaultdict(list)
    for d in docs:
        for k in d["author_keys"]:
            papers_by_author[k].append(d)

    # ---------------------------------------------------------- ano-alvo
    def viability(year: int) -> tuple[int, int]:
        pool = {
            k
            for k, ps in papers_by_author.items()
            if sum(1 for p in ps if p["year"] < year) >= args.min_history
        }
        subs = [d for d in docs if d["year"] == year and any(k in pool for k in d["author_keys"])]
        return len(subs), len(pool)

    candidate_years = sorted(y for y, c in by_year.items() if c >= 20 and y >= 2005)
    if args.year:
        target = args.year
    else:
        scored = [(y, *viability(y)) for y in candidate_years]
        target = max(scored, key=lambda t: t[1])[0] if scored else max(by_year)

    pool_keys = {
        k
        for k, ps in papers_by_author.items()
        if sum(1 for p in ps if p["year"] < target) >= args.min_history
    }

    submissions = []
    for d in docs:
        if d["year"] != target:
            continue
        relevant = [k for k in d["author_keys"] if k in pool_keys]
        if not relevant:
            continue
        submissions.append({**d, "relevant_reviewers": relevant})

    reviewers = []
    for k in sorted(pool_keys):
        history = [p for p in papers_by_author[k] if p["year"] < target]
        reviewers.append(
            {
                "id": k,
                "display_name": display_name(k),
                "n_history": len(history),
                "years": sorted({p["year"] for p in history}),
                "events": sorted({p["event"] for p in history}),
                "history_ids": [p["id"] for p in history],
            }
        )
    reviewers.sort(key=lambda r: -r["n_history"])

    used_ids = {p["id"] for r in reviewers for p in papers_by_author[r["id"]] if p["year"] < target}
    profile_docs = [d for d in docs if d["id"] in used_ids]

    stats = {
        "registros_coletados": len(records),
        "documentos_validos": len(docs),
        "ano_alvo": target,
        "min_historico": args.min_history,
        "pool_avaliadores": len(reviewers),
        "submissoes_avaliaveis": len(submissions),
        "media_relevantes_por_submissao": round(
            sum(len(s["relevant_reviewers"]) for s in submissions) / max(len(submissions), 1), 2
        ),
        "media_historico_por_avaliador": round(
            sum(r["n_history"] for r in reviewers) / max(len(reviewers), 1), 2
        ),
        "documentos_de_perfil": len(profile_docs),
        "por_evento": dict(Counter(d["event"] for d in docs)),
        "por_ano": {str(y): by_year[y] for y in sorted(by_year)},
        "idioma_resumo": dict(Counter(d["abstract_lang"] for d in docs)),
    }

    (OUT / "submissions.json").write_text(json.dumps(submissions, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "reviewers.json").write_text(json.dumps(reviewers, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "profile_docs.json").write_text(json.dumps(profile_docs, ensure_ascii=False, indent=1), encoding="utf-8")
    (OUT / "stats.json").write_text(json.dumps(stats, ensure_ascii=False, indent=2), encoding="utf-8")

    print(f"registros coletados   : {stats['registros_coletados']}")
    print(f"documentos validos    : {stats['documentos_validos']}")
    print(f"ano-alvo              : {target}")
    print(f"pool de avaliadores   : {stats['pool_avaliadores']} (>= {args.min_history} trabalhos previos)")
    print(f"submissoes avaliaveis : {stats['submissoes_avaliaveis']}")
    print(f"relevantes/submissao  : {stats['media_relevantes_por_submissao']}")
    print(f"historico/avaliador   : {stats['media_historico_por_avaliador']}")
    print(f"docs de perfil        : {stats['documentos_de_perfil']}")
    print(f"idioma do resumo      : {stats['idioma_resumo']}")


if __name__ == "__main__":
    main()
