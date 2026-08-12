"""Coleta o corpus de avaliacao da SBC OpenLib (SOL) via OAI-PMH 2.0.

O SOL roda OJS/PKP e expoe um endpoint OAI-PMH por evento. A documentacao e
ambigua quanto a licenca (CC BY 4.0 na FAQ, CC BY-NC 4.0 no termo de
autorizacao); o uso aqui e academico e nao comercial, restrito a metadados
descritivos e com atribuicao a fonte, logo permitido sob qualquer das duas.

Coletar o corpus pelo proprio protocolo que o trabalho implementa nao e
coincidencia: exercita, do lado do cliente, a mesma interface que o modulo
de interoperabilidade do SARA expoe do lado do servidor.

Saida:
  scripts/data/corpus-sol/raw/<evento>-<n>.xml  paginas brutas (reprodutibilidade)
  scripts/data/corpus-sol/records.json          registros normalizados

Boas praticas de harvesting aplicadas: uma requisicao por vez, intervalo
entre chamadas, respeito ao Retry-After em 503 e User-Agent identificavel.

Observacao sobre a instalacao: o OAI do SOL responde no escopo do site, nao
no da revista indicada no caminho da URL. Cada endpoint devolve registros de
varios eventos, com sobreposicao parcial entre eles. Por isso o evento de
cada registro e lido do setSpec e nao do endpoint consultado, e a uniao das
paginas e desduplicada pelo identificador OAI.

Uso:
  python harvest_sol.py                 coleta todos os eventos
  python harvest_sol.py sbseg sbcas     coleta apenas os eventos indicados
  python harvest_sol.py --offline       reconstroi records.json das paginas brutas
"""

import json
import re
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from xml.etree import ElementTree as ET

BASE = Path(__file__).resolve().parent / "data" / "corpus-sol"
RAW = BASE / "raw"

EVENTS = ["sbie", "wei", "semish", "sbbd", "sbseg", "sbcas"]

ENDPOINT = "https://sol.sbc.org.br/index.php/{event}/oai"
DELAY_SECONDS = 1.5
MAX_RETRIES = 4
USER_AGENT = "SARA-research-harvester/1.0 (pesquisa academica; coleta OAI-PMH de metadados CC BY)"

NS = {
    "oai": "http://www.openarchives.org/OAI/2.0/",
    "oai_dc": "http://www.openarchives.org/OAI/2.0/oai_dc/",
    "dc": "http://purl.org/dc/elements/1.1/",
}


def fetch(url: str) -> str:
    """GET com retry exponencial e respeito ao Retry-After."""
    for attempt in range(MAX_RETRIES):
        req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
        try:
            with urllib.request.urlopen(req, timeout=60) as resp:
                return resp.read().decode("utf-8", errors="replace")
        except urllib.error.HTTPError as exc:
            if exc.code == 503:
                wait = int(exc.headers.get("Retry-After", 10))
                print(f"    503, aguardando {wait}s")
                time.sleep(wait)
                continue
            raise
        except (urllib.error.URLError, TimeoutError) as exc:
            wait = 2 ** (attempt + 1)
            print(f"    {type(exc).__name__}, retry em {wait}s")
            time.sleep(wait)
    raise RuntimeError(f"falhou apos {MAX_RETRIES} tentativas: {url}")


def texts(node: ET.Element, tag: str) -> list[dict]:
    out = []
    for el in node.findall(f"dc:{tag}", NS):
        if el.text and el.text.strip():
            lang = el.attrib.get("{http://www.w3.org/XML/1998/namespace}lang", "")
            out.append({"lang": lang, "value": " ".join(el.text.split())})
    return out


def parse_page(xml: str, fallback_event: str) -> tuple[list[dict], str | None]:
    root = ET.fromstring(xml)
    err = root.find("oai:error", NS)
    if err is not None:
        raise RuntimeError(f"erro OAI-PMH [{err.attrib.get('code')}]: {err.text}")

    records = []
    for rec in root.findall(".//oai:record", NS):
        header = rec.find("oai:header", NS)
        if header is None or header.attrib.get("status") == "deleted":
            continue
        dc = rec.find(".//oai_dc:dc", NS)
        if dc is None:
            continue
        sets = [s.text for s in header.findall("oai:setSpec", NS) if s.text]
        # o setSpec tem a forma "<evento>:<secao>"; o evento e o prefixo
        event = sets[0].split(":")[0] if sets else fallback_event
        records.append(
            {
                "event": event,
                "identifier": header.findtext("oai:identifier", "", NS),
                "datestamp": header.findtext("oai:datestamp", "", NS),
                "sets": sets,
                "titles": texts(dc, "title"),
                "creators": [c["value"] for c in texts(dc, "creator")],
                "descriptions": texts(dc, "description"),
                "subjects": [s["value"] for s in texts(dc, "subject")],
                "dates": [d["value"] for d in texts(dc, "date")],
                "types": [t["value"] for t in texts(dc, "type")],
                "sources": [s["value"] for s in texts(dc, "source")],
            }
        )

    token_el = root.find(".//oai:resumptionToken", NS)
    token = token_el.text.strip() if token_el is not None and token_el.text else None
    return records, token


def harvest_event(event: str) -> list[dict]:
    RAW.mkdir(parents=True, exist_ok=True)
    base = ENDPOINT.format(event=event)
    url = f"{base}?verb=ListRecords&metadataPrefix=oai_dc"
    all_records: list[dict] = []
    page = 0

    while True:
        page += 1
        xml = fetch(url)
        (RAW / f"{event}-{page:04d}.xml").write_text(xml, encoding="utf-8")
        try:
            recs, token = parse_page(xml, event)
        except RuntimeError as exc:
            print(f"  {event}: {exc}")
            break
        all_records.extend(recs)
        print(f"  {event} pagina {page}: +{len(recs)} (total {len(all_records)})")
        if not token:
            break
        url = f"{base}?verb=ListRecords&resumptionToken={urllib.parse.quote(token, safe='')}"
        time.sleep(DELAY_SECONDS)

    return all_records


def rebuild_from_raw() -> list[dict]:
    """Reconstroi os registros a partir das paginas ja salvas em raw/."""
    records: list[dict] = []
    for path in sorted(RAW.glob("*.xml")):
        fallback = path.stem.rsplit("-", 1)[0]
        try:
            recs, _ = parse_page(path.read_text(encoding="utf-8"), fallback)
        except (ET.ParseError, RuntimeError) as exc:
            print(f"  ignorando {path.name}: {exc}")
            continue
        records.extend(recs)
    return records


def dedup(records: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for r in records:
        seen.setdefault(r["identifier"], r)
    return list(seen.values())


def main() -> None:
    BASE.mkdir(parents=True, exist_ok=True)
    if "--offline" in sys.argv:
        everything = rebuild_from_raw()
    else:
        everything = []
        for event in [a for a in sys.argv[1:] if not a.startswith("-")] or EVENTS:
            print(f"\n=== {event} ===")
            try:
                everything.extend(harvest_event(event))
            except Exception as exc:
                print(f"  ABORTADO: {type(exc).__name__}: {exc}")
            time.sleep(DELAY_SECONDS)

    brutos = len(everything)
    everything = dedup(everything)
    (BASE / "records.json").write_text(
        json.dumps(everything, ensure_ascii=False, indent=1), encoding="utf-8"
    )

    from collections import Counter

    print("\n=== RESUMO ===")
    print(f"  registros lidos     : {brutos}")
    print(f"  unicos (por OAI id) : {len(everything)}")
    for ev, n in Counter(r["event"] for r in everything).most_common(20):
        print(f"    {ev:24s} {n:6d}")


if __name__ == "__main__":
    main()
