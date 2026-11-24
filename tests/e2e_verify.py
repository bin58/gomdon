import os
import re
import tempfile
import zipfile
from pathlib import Path

from defusedxml import ElementTree as ET
from playwright.sync_api import sync_playwright

ROOT_DIR = Path(__file__).resolve().parent.parent
INDEX_URL = ROOT_DIR.joinpath("index.html").as_uri()


def assert_eq(actual, expected, msg=""):
    if actual != expected:
        raise AssertionError(f"{msg}: expected {expected!r}, got {actual!r}")


def run_tests():
    with sync_playwright() as p:
        browser = p.chromium.launch()
        try:
            # 1. Online mode (SheetJS loaded) - DOM, Table Sync, TSV, XLSX XML, Theme, Modal
            context = browser.new_context(accept_downloads=True)
            context.add_init_script(
                """
                window.__copiedTexts = [];
                Object.defineProperty(navigator, 'clipboard', {
                  value: {
                    writeText: async (text) => { window.__copiedTexts.push(text); },
                    readText: async () => ''
                  },
                  configurable: true
                });
                """
            )
            page = context.new_page()
            page_errors = []
            page.on("pageerror", lambda exc: page_errors.append(str(exc)))

            page.goto(INDEX_URL, wait_until="load")
            page.wait_for_function("() => typeof XLSX === 'object'")
            assert_eq(page_errors, [], "Zero JS page errors on load")

            # Parse SAMPLES.food and SAMPLES.shop via UI
            page.click("#btnSampleFood")
            page.click("#btnParse")
            assert_eq(page.locator("#ordersBody tr").count(), 4, "SAMPLES.food row count")

            page.click("#btnSampleShop")
            page.click("#btnParse")
            assert_eq(page.locator("#ordersBody tr").count(), 4, "SAMPLES.shop row count")

            # R3.3: Table Qty/Amount DOM sync on 0 / empty + focus preservation
            page.fill(
                "#rawInput",
                "Chị C 0912345678 2 áo thun 200k 123 Lê Lợi Q1",
            )
            page.click("#btnParse")
            assert_eq(page.locator("#ordersBody tr").count(), 1, "Single parsed row")

            page.evaluate("() => { window.__firstRowEl = document.querySelector('#ordersBody tr'); }")
            qty_input = page.locator('#ordersBody tr:first-child input[data-field="qty"]')
            total_input = page.locator('#ordersBody tr:first-child input[data-field="total"]')

            qty_input.focus()
            qty_input.fill("0")
            qty_input.press("Tab")  # blurs qty -> focuses total
            assert_eq(qty_input.input_value(), "1", "R3.3 qty=0 normalized DOM value")
            assert_eq(
                page.evaluate("() => JSON.parse(localStorage.getItem('gomdon_orders_v1'))[0].qty"),
                1,
                "R3.3 qty=0 stored value",
            )
            assert_eq(
                page.evaluate("() => document.activeElement === document.querySelector('#ordersBody tr:first-child input[data-field=\"total\"]')"),
                True,
                "R4 Tab focus moved to total without table re-render",
            )
            assert_eq(
                page.evaluate("() => window.__firstRowEl === document.querySelector('#ordersBody tr')"),
                True,
                "R4 row DOM node preserved (no full re-render)",
            )

            qty_input.focus()
            qty_input.fill("")
            qty_input.blur()
            assert_eq(qty_input.input_value(), "1", "R3.3 empty qty normalized DOM value")

            total_input.focus()
            total_input.fill("")
            total_input.blur()
            assert_eq(total_input.input_value(), "0", "R3.3 empty total normalized DOM value")
            assert_eq(
                page.evaluate("() => JSON.parse(localStorage.getItem('gomdon_orders_v1'))[0].total"),
                0,
                "R3.3 empty total stored value",
            )

            # R3.1 & R3.2: Prepare orders with formula-like payloads & leading-zero phone
            page.evaluate(
                """
                () => {
                  const malicious = [
                    {
                      name: '=1+1',
                      phone: '0912345678',
                      address: '+cmd|"/C calc"!A0',
                      items: '-2 áo sơ mi',
                      qty: 2,
                      total: 250000,
                      note: '@SUM(1,1)'
                    },
                    {
                      name: 'Chị Nguyễn Thị Lan',
                      phone: '02838123456',
                      address: '20 Lý Tự Trọng',
                      items: '1 đầm lụa',
                      qty: 1,
                      total: 1200000,
                      note: 'ship 30k'
                    }
                  ];
                  localStorage.setItem('gomdon_orders_v1', JSON.stringify(malicious));
                }
                """
            )
            page.reload(wait_until="load")
            page.wait_for_function("() => typeof XLSX === 'object'")

            # R3.1: Google Sheets TSV copy
            page.click("#btnCopySheet")
            tsv_text = page.evaluate("() => window.__copiedTexts[window.__copiedTexts.length - 1]")
            tsv_lines = tsv_text.split("\n")
            assert_eq(len(tsv_lines), 3, "TSV header + 2 rows")
            row1_cols = tsv_lines[1].split("\t")
            assert_eq(row1_cols[1], "'=1+1", "TSV formula neutralization on name")
            assert_eq(row1_cols[2], '="0912345678"', "R3.1 TSV preserves leading 0 on mobile")
            row2_cols = tsv_lines[2].split("\t")
            assert_eq(row2_cols[2], '="02838123456"', "R3.1 TSV preserves leading 0 on 02 landline")

            # R3.2: Export real .xlsx & inspect OOXML internals
            with tempfile.TemporaryDirectory() as tmpdir:
                with page.expect_download() as dl_info:
                    page.click("#btnExportExcel")
                download = dl_info.value
                assert download.suggested_filename.endswith(".xlsx"), f"Expected .xlsx, got {download.suggested_filename}"
                xlsx_path = Path(tmpdir) / download.suggested_filename
                download.save_as(str(xlsx_path))

                with zipfile.ZipFile(xlsx_path, "r") as zf:
                    sheet_xml = zf.read("xl/worksheets/sheet1.xml").decode("utf-8")
                    sheet_root = ET.fromstring(sheet_xml)
                    ns = {"main": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
                    formula_nodes = sheet_root.findall(".//main:f", ns)
                    assert_eq(len(formula_nodes), 0, "R3.2 .xlsx must contain zero <f> formula nodes")

                    shared_strings = []
                    if "xl/sharedStrings.xml" in zf.namelist():
                        ss_root = ET.fromstring(zf.read("xl/sharedStrings.xml").decode("utf-8"))
                        for si in ss_root.findall(".//main:si", ns):
                            texts = [t.text or "" for t in si.findall(".//main:t", ns)]
                            shared_strings.append("".join(texts))

                    inline_strings = [
                        t.text or ""
                        for c in sheet_root.findall(".//main:c[@t='inlineStr']", ns)
                        for t in c.findall(".//main:t", ns)
                    ]
                    str_cells = [
                        v.text or ""
                        for c in sheet_root.findall(".//main:c[@t='str']", ns)
                        for v in c.findall(".//main:v", ns)
                    ]
                    all_strings = shared_strings + inline_strings + str_cells

                    # Verify text columns have t="str" or t="s" (never formula/numeric coercion)
                    b2 = sheet_root.find(".//main:c[@r='B2']", ns)
                    c2 = sheet_root.find(".//main:c[@r='C2']", ns)
                    assert b2 is not None and b2.attrib.get("t") in ("str", "s", "inlineStr"), f"B2 unexpected type: {b2.attrib if b2 is not None else None}"
                    assert c2 is not None and c2.attrib.get("t") in ("str", "s", "inlineStr"), f"C2 unexpected type: {c2.attrib if c2 is not None else None}"

                    for expected_val in ["=1+1", '+cmd|"/C calc"!A0', "-2 áo sơ mi", "@SUM(1,1)", "0912345678", "02838123456", "Chị Nguyễn Thị Lan"]:
                        assert expected_val in all_strings, f"Missing {expected_val!r} in .xlsx strings: {all_strings}"

                    for s in all_strings:
                        assert not re.match(r"^'[=+\-@\t\r]", s), f"R3.2 visible leading quote in .xlsx cell: {s!r}"

            # R4: Esc closes #upgradeModal
            page.click("#btnUpgrade")
            assert_eq(page.locator("#upgradeModal").evaluate("el => el.classList.contains('hidden')"), False, "Modal opens")
            page.keyboard.press("Escape")
            assert_eq(page.locator("#upgradeModal").evaluate("el => el.classList.contains('hidden')"), True, "R4 Esc closes modal")

            # R4: Dark mode warning color (#fcd34d)
            page.click("#btnThemeToggle")
            assert_eq(page.evaluate("() => document.documentElement.dataset.theme"), "dark", "Dark theme toggled")
            page.fill("#rawInput", "Chị A 1 áo 100k")
            page.click("#btnParse")
            warn_color = page.locator(".status-warn").first.evaluate("el => getComputedStyle(el).color")
            assert_eq(warn_color, "rgb(252, 211, 77)", "R4 dark mode .status-warn color #fcd34d")

            context.close()

            # 2. Offline mode (SheetJS blocked) -> CSV fallback & BOM/formula/leading-zero verification
            offline_ctx = browser.new_context(accept_downloads=True)
            offline_ctx.route(re.compile(r"cdn\.sheetjs\.com"), lambda route: route.abort())
            offline_page = offline_ctx.new_page()
            offline_page.goto(INDEX_URL, wait_until="load")
            assert_eq(offline_page.evaluate("() => typeof XLSX"), "undefined", "XLSX undefined when offline")

            offline_page.evaluate(
                """
                () => {
                  const data = [{
                    name: '=1+1',
                    phone: '0912345678',
                    address: '12 Lê Lợi',
                    items: '1 áo',
                    qty: 1,
                    total: 200000,
                    note: 'đã ck'
                  }];
                  localStorage.setItem('gomdon_orders_v1', JSON.stringify(data));
                }
                """
            )
            offline_page.reload(wait_until="load")
            with tempfile.TemporaryDirectory() as tmpdir:
                with offline_page.expect_download() as dl_info:
                    offline_page.click("#btnExportExcel")
                dl = dl_info.value
                assert dl.suggested_filename.endswith(".csv"), f"Expected .csv fallback, got {dl.suggested_filename}"
                csv_path = Path(tmpdir) / dl.suggested_filename
                dl.save_as(str(csv_path))
                raw_bytes = csv_path.read_bytes()
                assert raw_bytes.startswith(b"\xef\xbb\xbf"), "R4 CSV has UTF-8 BOM"
                csv_text = raw_bytes.decode("utf-8-sig")
                assert '"\'=1+1"' in csv_text, f"R4 CSV formula neutralized: {csv_text}"
                assert '"=""0912345678"""' in csv_text, f"R4 CSV phone leading zero preserved: {csv_text}"

            offline_ctx.close()

            # 3. localStorage throwing SecurityError safety
            ls_ctx = browser.new_context()
            ls_ctx.add_init_script(
                """
                Object.defineProperty(window, 'localStorage', {
                  get() {
                    return {
                      getItem() { throw new DOMException('Blocked', 'SecurityError'); },
                      setItem() { throw new DOMException('Blocked', 'SecurityError'); }
                    };
                  }
                });
                """
            )
            ls_page = ls_ctx.new_page()
            ls_errors = []
            ls_page.on("pageerror", lambda exc: ls_errors.append(str(exc)))
            ls_page.goto(INDEX_URL, wait_until="load")
            ls_page.click("#btnSampleFood")
            ls_page.click("#btnParse")
            assert_eq(ls_page.locator("#ordersBody tr").count(), 4, "R4 app works when localStorage throws")
            assert_eq(ls_errors, [], "R4 zero page errors when localStorage throws")
            ls_ctx.close()

            print("E2E_VERIFY: ALL CHECKS PASSED")
        finally:
            browser.close()


if __name__ == "__main__":
    run_tests()
