"""
Validação de conformidade do endpoint OAI-PMH do SARA contra o XSD oficial
do protocolo (OAI-PMH 2.0) e o XSD do Dublin Core (oai_dc).

Uso:
    python scripts/validate-oai.py [base_url]

Requer a API rodando (default: http://localhost:8080/oai).
Gera evidência de conformidade para a Seção 5.1 do paper.
"""

import os
import re
import sys

import requests
import xmlschema

XSD_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), "xsd")
# dublincore.org rejeita o user-agent padrão do urllib (403), então os schemas são
# baixados via requests e cacheados localmente — isso também torna a validação
# reprodutível offline.
UA = {"User-Agent": "Mozilla/5.0 (compatible; SARA-OAI-Validator/1.0)"}

BASE = sys.argv[1] if len(sys.argv) > 1 else "http://localhost:8080/oai"

OAI_XSD = "http://www.openarchives.org/OAI/2.0/OAI-PMH.xsd"
DC_XSD = "http://www.openarchives.org/OAI/2.0/oai_dc.xsd"
SIMPLEDC_XSD = "http://dublincore.org/schemas/xmls/simpledc20021212.xsd"

# oai_dc.xsd importa os elementos dc: do dublincore.org; o mapeamento explícito
# de namespace -> URL garante que o import seja resolvido na ordem correta.
LOCATIONS = [
    ("http://purl.org/dc/elements/1.1/", SIMPLEDC_XSD),
    ("http://www.openarchives.org/OAI/2.0/oai_dc/", DC_XSD),
]


def cache_schemas():
    """Baixa os XSDs oficiais e reescreve os imports para caminhos locais."""
    os.makedirs(XSD_DIR, exist_ok=True)
    files = {}
    for url in (OAI_XSD, DC_XSD, SIMPLEDC_XSD):
        name = url.rsplit("/", 1)[-1]
        path = os.path.join(XSD_DIR, name)
        if not os.path.exists(path):
            r = requests.get(url, headers=UA, timeout=30)
            r.raise_for_status()
            with open(path, "w", encoding="utf-8") as f:
                f.write(r.text)
        files[name] = path

    # Reescreve schemaLocation remoto -> arquivo local irmão
    for path in files.values():
        with open(path, encoding="utf-8") as f:
            content = f.read()
        new = re.sub(r'schemaLocation="https?://[^"]*/([^/"]+\.xsd)"',
                     r'schemaLocation="\1"', content)
        if new != content:
            with open(path, "w", encoding="utf-8") as f:
                f.write(new)

    return files["OAI-PMH.xsd"], files["oai_dc.xsd"]


def fetch(params):
    r = requests.get(BASE, params=params, timeout=30)
    r.raise_for_status()
    return r.text


def main():
    print(f"Endpoint sob teste: {BASE}")
    print(f"Schema OAI-PMH:     {OAI_XSD}")
    print(f"Schema Dublin Core: {DC_XSD}\n")

    oai_local, dc_local = cache_schemas()
    # build=True é necessário: metadataType no OAI-PMH.xsd usa processContents="strict",
    # então o oai_dc.xsd precisa estar nos mesmos global maps para o dc ser reconhecido.
    schema = xmlschema.XMLSchema(oai_local)
    schema.add_schema(dc_local, build=True)

    # Descobre um identificador real para o GetRecord
    ids_xml = fetch({"verb": "ListIdentifiers", "metadataPrefix": "oai_dc"})
    identifier = None
    if "<identifier>" in ids_xml:
        identifier = ids_xml.split("<identifier>")[1].split("</identifier>")[0]

    cases = [
        ("Identify", {"verb": "Identify"}, "resposta válida"),
        ("ListMetadataFormats", {"verb": "ListMetadataFormats"}, "resposta válida"),
        ("ListIdentifiers", {"verb": "ListIdentifiers", "metadataPrefix": "oai_dc"}, "resposta válida"),
        ("ListRecords", {"verb": "ListRecords", "metadataPrefix": "oai_dc"}, "resposta válida"),
        ("ListSets", {"verb": "ListSets"}, "erro noSetHierarchy"),
        ("badVerb", {"verb": "Bogus"}, "erro badVerb"),
        ("badArgument (sem metadataPrefix)", {"verb": "ListRecords"}, "erro badArgument"),
        ("cannotDisseminateFormat", {"verb": "ListRecords", "metadataPrefix": "marc21"}, "erro cannotDisseminateFormat"),
        ("idDoesNotExist", {"verb": "GetRecord", "metadataPrefix": "oai_dc", "identifier": "oai:sara:00000000-0000-0000-0000-000000000000"}, "erro idDoesNotExist"),
        ("identificador estrangeiro", {"verb": "GetRecord", "metadataPrefix": "oai_dc", "identifier": "oai:outro:123"}, "erro idDoesNotExist"),
    ]
    if identifier:
        cases.insert(4, ("GetRecord", {"verb": "GetRecord", "metadataPrefix": "oai_dc", "identifier": identifier}, "resposta válida"))

    passed = failed = 0
    print(f"{'CASO':<28} {'ESPERADO':<38} {'XSD':<8} DETALHE")
    print("-" * 110)

    for name, params, expected in cases:
        try:
            xml = fetch(params)
        except Exception as e:
            print(f"{name:<28} {expected:<38} {'ERRO':<8} falha HTTP: {e}")
            failed += 1
            continue

        try:
            schema.validate(xml)
            valid, detail = True, ""
        except Exception as e:
            valid, detail = False, str(e).split("\n")[0][:60]

        code = ""
        if "<error code=" in xml:
            code = xml.split('<error code="')[1].split('"')[0]

        status = "OK" if valid else "FALHA"
        observed = f"erro {code}" if code else "resposta válida"
        match = observed == expected

        if valid and match:
            passed += 1
        else:
            failed += 1
            detail = detail or f"observado: {observed}"

        print(f"{name:<28} {expected:<38} {status:<8} {detail}")

    print("-" * 110)
    print(f"\nRESULTADO: {passed} conformes / {failed} não conformes / {passed + failed} casos")
    return 0 if failed == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
