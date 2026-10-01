#!/usr/bin/env python3
"""Extrae las tiendas de Fundación Nicoya del Excel de rutas y genera el seed de Supabase.

Uso:
    python3 scripts/preparar_tiendas.py "/ruta/a/RUTA DE TIENDAS 2026.xlsx"

Si existe data/personas.txt (un nombre por línea), también agrega esas personas al seed.

Salidas (fuera de git):
    data/tiendas.json   -> revisión manual
    supabase/seed.sql   -> pegar en el SQL Editor de Supabase después de schema.sql
"""
import json
import re
import sys
import time
import urllib.parse
import urllib.request
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path

ORGANIZACION = "Fundación Nicoya"
NS = {"m": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
RAIZ = Path(__file__).resolve().parent.parent

# Rango aproximado que cubre Mexicali, su valle y Tecate.
LAT_MIN, LAT_MAX = 32.0, 32.8
LNG_MIN, LNG_MAX = -116.8, -114.9


def leer_hojas(xlsx):
    """Devuelve {nombre_hoja: [ {columna: valor} ]} usando solo la librería estándar."""
    with zipfile.ZipFile(xlsx) as z:
        compartidas = []
        if "xl/sharedStrings.xml" in z.namelist():
            raiz = ET.fromstring(z.read("xl/sharedStrings.xml"))
            for si in raiz.findall("m:si", NS):
                compartidas.append("".join(t.text or "" for t in si.iter(f"{{{NS['m']}}}t")))

        libro = ET.fromstring(z.read("xl/workbook.xml"))
        rels = ET.fromstring(z.read("xl/_rels/workbook.xml.rels"))
        destino = {r.get("Id"): r.get("Target") for r in rels}
        rid_attr = "{http://schemas.openxmlformats.org/officeDocument/2006/relationships}id"

        hojas = {}
        for hoja in libro.find("m:sheets", NS):
            ruta = destino[hoja.get(rid_attr)].lstrip("/")
            if not ruta.startswith("xl/"):
                ruta = "xl/" + ruta
            filas = []
            datos = ET.fromstring(z.read(ruta)).find("m:sheetData", NS)
            for fila in datos.findall("m:row", NS):
                d = {}
                for c in fila.findall("m:c", NS):
                    col = re.match(r"[A-Z]+", c.get("r")).group()
                    v = c.find("m:v", NS)
                    if v is not None:
                        d[col] = compartidas[int(v.text)] if c.get("t") == "s" else v.text
                    elif c.get("t") == "inlineStr":
                        d[col] = "".join(t.text or "" for t in c.iter(f"{{{NS['m']}}}t"))
                filas.append(d)
            hojas[hoja.get("name")] = filas
        return hojas


def limpio(valor):
    if valor is None:
        return ""
    return re.sub(r"\s+", " ", str(valor)).strip()


def coord_valida(lat, lng):
    return lat is not None and lng is not None and LAT_MIN < lat < LAT_MAX and LNG_MIN < lng < LNG_MAX


def a_float(valor):
    try:
        return float(valor)
    except (TypeError, ValueError):
        return None


def geocodificar(consultas):
    """Prueba cada consulta en Nominatim (1 petición/segundo) y regresa la primera válida."""
    for q in consultas:
        url = "https://nominatim.openstreetmap.org/search?" + urllib.parse.urlencode(
            {"q": q, "format": "json", "limit": 1, "countrycodes": "mx"}
        )
        req = urllib.request.Request(url, headers={"User-Agent": "redondeo-nicoya/1.0"})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                res = json.load(r)
        except Exception as e:  # noqa: BLE001 - seguimos con la siguiente consulta
            print(f"    ! error consultando '{q}': {e}")
            res = []
        time.sleep(1.1)
        if res:
            lat, lng = float(res[0]["lat"]), float(res[0]["lon"])
            if coord_valida(lat, lng):
                return lat, lng, q
    return None


def sql_texto(v):
    if v is None or v == "":
        return "null"
    return "'" + str(v).replace("'", "''") + "'"


def main():
    if len(sys.argv) < 2:
        sys.exit(__doc__)
    hojas = leer_hojas(sys.argv[1])
    listado = hojas["Listado de Tiendas"][2:]  # fila 1 = título, fila 2 = encabezados
    cnt = {limpio(r.get("H")): r for r in hojas["CNT"][1:]}

    tiendas = []
    for r in listado:
        if limpio(r.get("A")) != ORGANIZACION:
            continue
        cr = limpio(r.get("D"))
        extra = cnt.get(cr, {})
        lat, lng = a_float(extra.get("BR")), a_float(extra.get("BT"))
        tiendas.append({
            "cr": cr,
            "nombre": limpio(r.get("E")),
            "calle": limpio(r.get("F")),
            "numero": limpio(r.get("G")),
            "entre_calles": limpio(r.get("H")),
            "referencia": limpio(r.get("I")),
            "colonia": limpio(extra.get("T")).lstrip("*"),
            "cp": limpio(extra.get("U")),
            "municipio": limpio(r.get("K")),
            "estado": limpio(r.get("J")),
            "ruta_oxxo": int(a_float(r.get("B")) or 0) or None,
            "asesor_oxxo": limpio(r.get("C")),
            "lat": lat if coord_valida(lat, lng) else None,
            "lng": lng if coord_valida(lat, lng) else None,
            "ubicacion_aprox": not coord_valida(lat, lng),
        })

    print(f"Tiendas {ORGANIZACION}: {len(tiendas)}")
    faltan = [t for t in tiendas if t["ubicacion_aprox"]]
    print(f"Con coordenadas del Excel: {len(tiendas) - len(faltan)}  |  A geocodificar: {len(faltan)}")

    for t in faltan:
        ciudad = f"{t['municipio'].title()}, Baja California"
        consultas = [
            f"{t['calle']} {t['numero']}, {t['colonia']}, {ciudad}" if t["colonia"] else None,
            f"{t['calle']} {t['numero']}, {ciudad}",
            f"{t['colonia']}, {ciudad}" if t["colonia"] else None,
            f"{t['cp']}, {ciudad}" if t["cp"] else None,
            ciudad,
        ]
        res = geocodificar([q for q in consultas if q])
        if res:
            t["lat"], t["lng"], usada = res
            print(f"  {t['cr']} {t['nombre']:<22} -> {t['lat']:.5f},{t['lng']:.5f}  ({usada})")
        else:
            print(f"  {t['cr']} {t['nombre']:<22} -> SIN UBICACIÓN")

    (RAIZ / "data").mkdir(exist_ok=True)
    (RAIZ / "data" / "tiendas.json").write_text(json.dumps(tiendas, ensure_ascii=False, indent=2))

    columnas = ["cr", "nombre", "calle", "numero", "entre_calles", "referencia", "colonia", "cp",
                "municipio", "estado", "ruta_oxxo", "asesor_oxxo", "lat", "lng", "ubicacion_aprox"]
    filas = []
    for t in tiendas:
        valores = []
        for c in columnas:
            v = t[c]
            if isinstance(v, bool):
                valores.append("true" if v else "false")
            elif isinstance(v, (int, float)):
                valores.append(repr(v))
            else:
                valores.append(sql_texto(v))
        filas.append("  (" + ", ".join(valores) + ")")

    sql = (
        f"-- Generado por scripts/preparar_tiendas.py ({len(tiendas)} tiendas de {ORGANIZACION})\n"
        f"insert into public.tiendas ({', '.join(columnas)}) values\n"
        + ",\n".join(filas)
        + "\non conflict (cr) do update set\n  "
        + ",\n  ".join(f"{c} = excluded.{c}" for c in columnas[1:])
        + ";\n\ninsert into public.estado_tienda (cr) select cr from public.tiendas on conflict do nothing;\n"
    )
    personas_txt = RAIZ / "data" / "personas.txt"
    if personas_txt.exists():
        nombres = [n.strip() for n in personas_txt.read_text().splitlines() if n.strip()]
        sql += (
            f"\n-- Personas que visitan (de data/personas.txt)\n"
            "insert into public.personas (nombre) values\n"
            + ",\n".join(f"  ({sql_texto(n)})" for n in nombres)
            + "\non conflict (nombre) do nothing;\n"
        )
        print(f"Personas: {len(nombres)} ({', '.join(nombres)})")
    (RAIZ / "supabase" / "seed.sql").write_text(sql)
    print(f"\nListo: data/tiendas.json y supabase/seed.sql ({len(tiendas)} tiendas)")


if __name__ == "__main__":
    main()
