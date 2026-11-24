"use strict";

const { describe, it } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const {
  parseLocallyVietnamese,
  isValidPhone,
  SAMPLES,
  neutralizeFormula,
  getExportRows,
  normalizeOrder,
} = require("../app.js");

const ROOT_DIR = path.resolve(__dirname, "..");

describe("Static compatibility & iOS < 16.4 Safari checks (R2.1)", () => {
  it("has zero regex lookbehinds (?<! or (?<=) in shipped JS and HTML files", () => {
    const files = ["app.js", "index.html", "style.css"];
    for (const file of files) {
      const content = fs.readFileSync(path.join(ROOT_DIR, file), "utf8");
      assert.equal(/\(\?<[=!]/.test(content), false, `Found lookbehind in ${file}`);
    }
  });

  it("has zero numeric underscore separators (1_000) in app.js", () => {
    const content = fs.readFileSync(path.join(ROOT_DIR, "app.js"), "utf8");
    assert.equal(/\b\d+_\d+\b/.test(content), false, "Found numeric separator in app.js");
  });
});

describe("Phone validation & R1 phone regression / single-line splitting", () => {
  it("validates 10-digit 0[35789] and strictly 11-digit 02 landlines (R3.4, R4)", () => {
    assert.equal(isValidPhone("0912345678"), true);
    assert.equal(isValidPhone("0356789123"), true);
    assert.equal(isValidPhone("0581234567"), true);
    assert.equal(isValidPhone("0701234567"), true);
    assert.equal(isValidPhone("0868999888"), true);
    assert.equal(isValidPhone("02838123456"), true);
    assert.equal(isValidPhone("02438123456"), true);

    // Reject 10-digit 02 landlines & tracking codes
    assert.equal(isValidPhone("0281234567"), false);
    assert.equal(isValidPhone("0241234567"), false);
    assert.equal(isValidPhone("120912345678"), false);
    assert.equal(isValidPhone(""), false);
  });

  it("extracts phone when immediately followed by single-digit quantity (R1a)", () => {
    const [o1] = parseLocallyVietnamese("Chị C 0912345678 2 áo thun 200k 123 Lê Lợi Q1");
    assert.equal(o1.phone, "0912345678");
    assert.equal(o1.name, "Chị C");
    assert.equal(o1.items, "2 áo thun");
    assert.equal(o1.qty, 2);
    assert.equal(o1.total, 200000);
    assert.equal(o1.address, "123 Lê Lợi Q1");

    const [o2] = parseLocallyVietnamese("Chị A +84912345678 - 1 áo 200k");
    assert.equal(o2.phone, "0912345678");
    assert.equal(o2.name, "Chị A");
    assert.equal(o2.items, "1 áo");
    assert.equal(o2.qty, 1);

    // 10-digit 028 followed by - 1 must NOT steal "1" to form 11 digits
    const [o3] = parseLocallyVietnamese("Chị A 0283812345 - 1 áo 200k");
    assert.equal(o3.phone, "");
    assert.equal(o3.items, "1 áo");
    assert.equal(o3.qty, 1);

    // 11-digit 028 followed by - 1 works cleanly
    const [o4] = parseLocallyVietnamese("Chị A 02838123456 - 1 áo 200k");
    assert.equal(o4.phone, "02838123456");
    assert.equal(o4.name, "Chị A");
    assert.equal(o4.items, "1 áo");
  });

  it("splits consecutive single-line orders without blank lines and handles mixed blocks (R1b)", () => {
    const res = parseLocallyVietnamese(
      "Chị P 0912345678 1 áo sơ mi 200k 12 Lê Lợi Q1\nAnh Q 0987654321 2 quần jean 500k 45 Nguyễn Trãi HN"
    );
    assert.equal(res.length, 2);
    assert.equal(res[0].name, "Chị P");
    assert.equal(res[0].phone, "0912345678");
    assert.equal(res[0].items, "1 áo sơ mi");
    assert.equal(res[0].qty, 1);
    assert.equal(res[0].total, 200000);
    assert.equal(res[1].name, "Anh Q");
    assert.equal(res[1].phone, "0987654321");
    assert.equal(res[1].items, "2 quần jean");
    assert.equal(res[1].qty, 2);
    assert.equal(res[1].total, 500000);

    // Mixed blank-line labeled block + consecutive single-line block
    const mixed = parseLocallyVietnamese(
      "Tên: An\nSĐT: 0912345678\nĐC: 12 Lê Lợi Q1\nMón: 1 cơm 40k\nGhi chú: gọi 0912345678 khi tới\n\nChị P 0912345678 1 áo 200k\nAnh Q 0987654321 2 quần 300k"
    );
    assert.equal(mixed.length, 3);
    assert.equal(mixed[0].name, "An");
    assert.equal(mixed[0].phone, "0912345678");
    assert.equal(mixed[0].items, "1 cơm");
    assert.equal(mixed[1].name, "Chị P");
    assert.equal(mixed[2].name, "Anh Q");
  });

  it("keeps unlabeled multi-line orders with phone-only or call-instruction lines merged (R1 + R2.6)", () => {
    const res1 = parseLocallyVietnamese(
      "Chị Lan\n0912345678\n2 áo thun 200k\n45 Nguyễn Trãi, Q1\ngọi 0987654321 khi tới"
    );
    assert.equal(res1.length, 1);
    assert.equal(res1[0].name, "Chị Lan");
    assert.equal(res1[0].phone, "0912345678");
    assert.equal(res1[0].address, "45 Nguyễn Trãi, Q1");
    assert.equal(res1[0].items, "2 áo thun");
    assert.equal(res1[0].qty, 2);
    assert.equal(res1[0].total, 200000);
    assert.equal(res1[0].note, "gọi 0987654321 khi tới");

    const res2 = parseLocallyVietnamese(
      "Chị Lan\n0912345678\n2 áo thun 200k\n45 Nguyễn Trãi, Q1\ngọi 0912345678 khi tới"
    );
    assert.equal(res2.length, 1);
    assert.equal(res2[0].phone, "0912345678");
    assert.equal(res2[0].address, "45 Nguyễn Trãi, Q1");
    assert.equal(res2[0].items, "2 áo thun");
    assert.equal(res2[0].note, "gọi khi tới");

    const res3 = parseLocallyVietnamese(
      "Anh Hùng\n0909111222\n1 cơm tấm 50k\n20 Lý Tự Trọng\nliên hệ 0909333444 khi giao hàng nhé"
    );
    assert.equal(res3.length, 1);
    assert.equal(res3[0].phone, "0909111222");
    assert.equal(res3[0].address, "20 Lý Tự Trọng");
    assert.equal(res3[0].items, "1 cơm tấm");
    assert.equal(res3[0].note, "liên hệ 0909333444 khi giao hàng nhé");
  });
});

describe("R2 currency, shipping, address, comma segments, repeated phones", () => {
  it("parses shorthand currency 1tr2 and 1k5 without polluting qty (R2.2)", () => {
    const [o1] = parseLocallyVietnamese("Chị A 0912345678 1 đầm 1tr2 12 Lê Lợi Q1");
    assert.equal(o1.total, 1200000);
    assert.equal(o1.qty, 1);
    assert.equal(o1.items, "1 đầm");

    const [o2] = parseLocallyVietnamese("Chị A 0912345678 1 nước suối 1k5 12 Lê Lợi Q1");
    assert.equal(o2.total, 1500);
    assert.equal(o2.qty, 1);
    assert.equal(o2.items, "1 nước suối");

    const [o3] = parseLocallyVietnamese("Chị A 0912345678 2 áo 500k cọc 1tr2 tổng 450k");
    assert.equal(o3.total, 450000);
    assert.match(o3.note, /cọc 1tr2/i);

    const [o4] = parseLocallyVietnamese("Chị A 0912345678 1 áo 200k 2 quần 100k");
    assert.equal(o4.total, 300000);
    assert.equal(o4.qty, 3);
  });

  it("handles shipping fees consistently without leaving 'ship' in items (R2.3)", () => {
    const [o1] = parseLocallyVietnamese("Chị A 0912345678 1 áo 200k ship 30k 12 Lê Lợi Q1");
    assert.equal(o1.items, "1 áo");
    assert.equal(o1.qty, 1);
    assert.equal(o1.total, 230000);
    assert.equal(o1.note, "ship 30k");

    const [o2] = parseLocallyVietnamese("Chị A 0912345678 1 áo 200k phí ship 30k");
    assert.equal(o2.items, "1 áo");
    assert.equal(o2.total, 230000);
    assert.equal(o2.note, "phí ship 30k");

    const [o3] = parseLocallyVietnamese("Chị A 0912345678 1 áo 200k ship 30k tổng 200k");
    assert.equal(o3.items, "1 áo");
    assert.equal(o3.total, 200000);
    assert.equal(o3.note, "ship 30k");

    const [o4] = parseLocallyVietnamese("Chị A 0912345678 1 áo 200k + ship 30k");
    assert.equal(o4.items, "1 áo");
    assert.equal(o4.total, 230000);
    assert.equal(o4.note, "ship 30k");

    const [o5] = parseLocallyVietnamese("Chị A 0912345678 1 áo 200k+ship 30k");
    assert.equal(o5.items, "1 áo");
    assert.equal(o5.total, 230000);
    assert.equal(o5.note, "ship 30k");

    const [o6] = parseLocallyVietnamese("Chị A 0912345678 1 váy + 1 túi 300k + ship 25k");
    assert.equal(o6.items, "1 váy + 1 túi");
    assert.equal(o6.qty, 2);
    assert.equal(o6.total, 325000);
    assert.equal(o6.note, "ship 25k");
  });

  it("recognizes addresses without district/street keywords without miscounting qty (R2.4)", () => {
    const [o1] = parseLocallyVietnamese("Chị B 0901234567 1 áo 200k giao 20 Lý Tự Trọng");
    assert.equal(o1.address, "20 Lý Tự Trọng");
    assert.equal(o1.items, "1 áo");
    assert.equal(o1.qty, 1);

    const [o2] = parseLocallyVietnamese("Chị B 0901234567 giao 20 Lý Tự Trọng 3 áo 200k");
    assert.equal(o2.address, "20 Lý Tự Trọng");
    assert.equal(o2.items, "3 áo");
    assert.equal(o2.qty, 3);

    // Capitalized items must NOT be treated as street addresses
    const [o3] = parseLocallyVietnamese("Chị A 0912345678 2 Áo Thun 200k");
    assert.equal(o3.address, "");
    assert.equal(o3.items, "2 Áo Thun");
    assert.equal(o3.qty, 2);

    const [o4] = parseLocallyVietnamese("Chị A 0912345678 2 Size XL 200k");
    assert.equal(o4.address, "");
    assert.equal(o4.items, "2 Size XL");
    assert.equal(o4.qty, 2);

    const [o5] = parseLocallyVietnamese("Chị Lan 0912345678 2 Chân Váy 200k");
    assert.equal(o5.address, "");
    assert.equal(o5.items, "2 Chân Váy");
    assert.equal(o5.qty, 2);
    assert.equal(o5.total, 200000);

    const [o6] = parseLocallyVietnamese("Chị Lan 0912345678 2 Nước Hoa 500k");
    assert.equal(o6.address, "");
    assert.equal(o6.items, "2 Nước Hoa");
    assert.equal(o6.qty, 2);
    assert.equal(o6.total, 500000);

    const [o7] = parseLocallyVietnamese("Chị Lan 0912345678 2 Sơ Mi Trắng 200k");
    assert.equal(o7.address, "");
    assert.equal(o7.items, "2 Sơ Mi Trắng");
    assert.equal(o7.qty, 2);
    assert.equal(o7.total, 200000);

    const [o8] = parseLocallyVietnamese("Chị A 0912345678 2 Bún Đậu Mắm Tôm 100k");
    assert.equal(o8.address, "");
    assert.equal(o8.items, "2 Bún Đậu Mắm Tôm");
    assert.equal(o8.qty, 2);
    assert.equal(o8.total, 100000);

    // Unkeyworded capitalized item with inline price must not be misclassified as address
    const [o9] = parseLocallyVietnamese("Chị Lan 0912345678 2 Bàn Phím Cơ 800k");
    assert.equal(o9.address, "");
    assert.equal(o9.items, "2 Bàn Phím Cơ");
    assert.equal(o9.qty, 2);
    assert.equal(o9.total, 800000);

    // Trailing item peeled from unkeyworded street address
    const [o10] = parseLocallyVietnamese("Chị Lan 0912345678 giao 20 Lý Tự Trọng 2 bún đậu 100k");
    assert.equal(o10.address, "20 Lý Tự Trọng");
    assert.equal(o10.items, "2 bún đậu");
    assert.equal(o10.qty, 2);
    assert.equal(o10.total, 100000);

    const [o11] = parseLocallyVietnamese("Chị Lan 0912345678 giao 20 Lý Tự Trọng 2 xúc xích 50k");
    assert.equal(o11.address, "20 Lý Tự Trọng");
    assert.equal(o11.items, "2 xúc xích");
    assert.equal(o11.qty, 2);
    assert.equal(o11.total, 50000);

    // Real Vietnamese addresses like "20 Đồng Khởi" and "20 Đường 3 tháng 2" remain intact
    const [o12] = parseLocallyVietnamese("Chị Lan 0912345678 giao 20 Đồng Khởi 1 áo 200k");
    assert.equal(o12.address, "20 Đồng Khởi");
    assert.equal(o12.items, "1 áo");

    const [o13] = parseLocallyVietnamese("Chị Lan 0912345678 giao 20 Đường 3 tháng 2");
    assert.equal(o13.address, "20 Đường 3 tháng 2");
  });

  it("splits comma-separated items from address while preserving multi-part addresses (R2.5)", () => {
    const [o1] = parseLocallyVietnamese("Chị D 0901234567 123 Nguyễn Trãi Q1, 2 áo sơ mi 300k");
    assert.equal(o1.address, "123 Nguyễn Trãi Q1");
    assert.equal(o1.items, "2 áo sơ mi");
    assert.equal(o1.qty, 2);
    assert.equal(o1.total, 300000);

    const [o2] = parseLocallyVietnamese("Chị D 0901234567 giao 123 Nguyễn Trãi Q1, 2 áo sơ mi 300k");
    assert.equal(o2.address, "123 Nguyễn Trãi Q1");
    assert.equal(o2.items, "2 áo sơ mi");
    assert.equal(o2.qty, 2);

    const [o3] = parseLocallyVietnamese("Chị D 0901234567 12 Lê Lợi, Q1, TP.HCM, 2 áo sơ mi 300k");
    assert.equal(o3.address, "12 Lê Lợi, Q1, TP.HCM");
    assert.equal(o3.items, "2 áo sơ mi");
  });

  it("strips repeated phone numbers and handles call phrases cleanly (R2.6)", () => {
    const [o1] = parseLocallyVietnamese(
      "Chị E 0912345678 1 áo 200k 12 Lê Lợi Q1 gọi 0912345678 khi tới"
    );
    assert.equal(o1.phone, "0912345678");
    assert.equal(o1.address, "12 Lê Lợi Q1");
    assert.equal(o1.items, "1 áo");
    assert.equal(o1.items.includes("0912345678"), false);
    assert.equal(o1.address.includes("0912345678"), false);
    assert.equal(o1.note, "gọi khi tới");

    const [o2] = parseLocallyVietnamese(
      "Chị E 0912345678 1 áo 200k 12 Lê Lợi Q1 gọi 0987654321 khi tới"
    );
    assert.equal(o2.phone, "0912345678");
    assert.equal(o2.items, "1 áo");
    assert.equal(o2.note, "gọi 0987654321 khi tới");

    const [o3] = parseLocallyVietnamese("Chị E 0912345678 1 áo 200k 0912.345.678");
    assert.equal(o3.phone, "0912345678");
    assert.equal(o3.items, "1 áo");

    const [o4] = parseLocallyVietnamese(
      "Chị A 0912345678 1 áo 200k gọi 0912345678 khi giao hàng nhé"
    );
    assert.equal(o4.items, "1 áo");
    assert.equal(o4.note, "gọi khi giao hàng nhé");

    const [o5] = parseLocallyVietnamese(
      "Chị A 0912345678 1 áo 200k gọi lại 0987654321 khi giao hàng nha"
    );
    assert.equal(o5.items, "1 áo");
    assert.equal(o5.note, "gọi lại 0987654321 khi giao hàng nha");

    const [o6] = parseLocallyVietnamese(
      "Chị A 0912345678 1 áo 200k gọi lại 0912345678 nhé"
    );
    assert.equal(o6.items, "1 áo");
    assert.equal(o6.note, "");
  });
});

describe("R4 preserved behaviors & sample datasets", () => {
  it("parses SAMPLES.food (4/4) verbatim", () => {
    const food = parseLocallyVietnamese(SAMPLES.food);
    assert.deepEqual(food, [
      {
        name: "Chị Lan",
        phone: "0912345678",
        address: "45 Nguyễn Trãi, Thanh Xuân, HN",
        items: "2 trà sữa trân châu đường đen + 1 bánh tráng trộn",
        qty: 3,
        total: 95000,
        note: "ship trước 5h nhé",
      },
      {
        name: "Anh Minh",
        phone: "0987654321",
        address: "12 Lê Lợi, Q1, TP.HCM",
        items: "3 cơm tấm sườn bì chả",
        qty: 3,
        total: 150000,
        note: "ko hành; gọi trc khi giao",
      },
      {
        name: "Bé Thảo",
        phone: "0356789123",
        address: "ngõ 68 Cầu Giấy, Hà Nội",
        items: "1 mẹt bún đậu đầy đủ",
        qty: 1,
        total: 65000,
        note: "đã ck",
      },
      {
        name: "Chị Hương",
        phone: "",
        address: "tòa nhà Landmark 81",
        items: "2 hộp chân gà sả tắc",
        qty: 2,
        total: 120000,
        note: "",
      },
    ]);
  });

  it("parses SAMPLES.shop (4/4) verbatim", () => {
    const shop = parseLocallyVietnamese(SAMPLES.shop);
    assert.deepEqual(shop, [
      {
        name: "Nguyễn Thị Mai",
        phone: "0909123456",
        address: "245 Võ Văn Ngân, Thủ Đức, HCM",
        items: "1 váy hoa nhí sz M + 1 túi cói",
        qty: 2,
        total: 420000,
        note: "giao giờ hành chính",
      },
      {
        name: "Anh Tuấn",
        phone: "0978111222",
        address: "88 Trần Phú, Hải Châu, Đà Nẵng",
        items: "2 áo polo nam đen trắng size XL",
        qty: 2,
        total: 380000,
        note: "",
      },
      {
        name: "Em Linh",
        phone: "0868999888",
        address: "số 15 ngõ 20 Hồ Tùng Mậu, Nam Từ Liêm, HN",
        items: "1 set đồ ngủ lụa hồng",
        qty: 1,
        total: 195000,
        note: "gói kín giúp em",
      },
      {
        name: "Chị Phương",
        phone: "0915666777",
        address: "",
        items: "1 quần jean ống rộng size S",
        qty: 1,
        total: 260000,
        note: "chưa có địa chỉ",
      },
    ]);
  });

  it("preserves price formats, cọc vs tổng, size exclusion, 2kg, tracking codes, and repeated Món:", () => {
    const [p1] = parseLocallyVietnamese("Chị A 0912345678 1 đầm 1.500k");
    assert.equal(p1.total, 1500000);

    const [p2] = parseLocallyVietnamese("Chị A 0912345678 1 đầm 500000đ");
    assert.equal(p2.total, 500000);

    const [p3] = parseLocallyVietnamese("Chị A 0912345678 1 đầm 250.000");
    assert.equal(p3.total, 250000);

    const [p4] = parseLocallyVietnamese("Chị A 0912345678 2 áo 500k cọc 100k tổng 450k ít đá ít đường");
    assert.equal(p4.total, 450000);
    assert.match(p4.note, /cọc 100k/i);
    assert.match(p4.note, /ít đá/i);
    assert.match(p4.note, /ít đường/i);

    const [p5] = parseLocallyVietnamese("Chị A 0912345678 2kg nho + 1 giày size 38 300k");
    assert.equal(p5.qty, 3);

    const [p6] = parseLocallyVietnamese("Chị A 0912345678 mã vận đơn 120912345678 1 áo 200k");
    assert.equal(p6.phone, "0912345678");

    const [p7] = parseLocallyVietnamese(
      "Tên: An\nSĐT: 0912345678\nĐC: 12 Lê Lợi Q1\nMón: 1 cơm 40k\nMón: 1 trà 15k"
    );
    assert.equal(p7.items, "1 cơm, 1 trà");
    assert.equal(p7.qty, 2);
    assert.equal(p7.total, 55000);
  });

  it("handles neutralizeFormula and getExportRows options cleanly", () => {
    assert.equal(neutralizeFormula("=1+1"), "'=1+1");
    assert.equal(neutralizeFormula("+cmd"), "'+cmd");
    assert.equal(neutralizeFormula("-2 áo"), "'-2 áo");
    assert.equal(neutralizeFormula("@SUM"), "'@SUM");
    assert.equal(neutralizeFormula("An"), "An");

    const sample = [
      normalizeOrder({
        name: "=1+1",
        phone: "0912345678",
        address: "12 Lê Lợi",
        items: "-2 áo",
        qty: 2,
        total: 100000,
        note: "@note",
      }),
    ];

    const xlsxRows = getExportRows({ orders: sample, neutralize: false });
    assert.equal(xlsxRows[0]["Tên khách hàng"], "=1+1");
    assert.equal(xlsxRows[0]["Món / Sản phẩm"], "-2 áo");
    assert.equal(xlsxRows[0]["Ghi chú"], "@note");

    const csvRows = getExportRows({ orders: sample, neutralize: true });
    assert.equal(csvRows[0]["Tên khách hàng"], "'=1+1");
    assert.equal(csvRows[0]["Món / Sản phẩm"], "'-2 áo");
    assert.equal(csvRows[0]["Ghi chú"], "'@note");
  });

  it("handles SĐT phụ, delivery dates, 'trước khi giao', unpriced 'ship', and item-attribute parens", () => {
    const secPhoneOrders = parseLocallyVietnamese(
      "Chị P 0912345678 1 áo 150k 12 Lê Lợi Q1\nSĐT phụ 0987654321"
    );
    assert.equal(secPhoneOrders.length, 1);
    assert.equal(secPhoneOrders[0].phone, "0912345678");
    assert.match(secPhoneOrders[0].note, /0987654321/);
    assert.equal(secPhoneOrders[0].items, "1 áo");

    const [dateOrder] = parseLocallyVietnamese(
      "Anh K 0912345678 1 áo 200k 20 Lý Tự Trọng Q1 giao ngày 5 tháng 12"
    );
    assert.equal(dateOrder.items, "1 áo");
    assert.equal(dateOrder.qty, 1);
    assert.match(dateOrder.note, /giao ngày 5 tháng 12/i);

    const callOrders = parseLocallyVietnamese(
      "Chị M 0912345678 1 váy 250k 25 Hàng Bài\nGọi 0912345678 trước khi giao"
    );
    assert.equal(callOrders.length, 1);
    assert.equal(callOrders[0].items, "1 váy");
    assert.match(callOrders[0].note, /trước khi giao/i);

    const [shipOrder] = parseLocallyVietnamese(
      "Anh T 0912345678 1 áo 180k ship nhanh 12 Lê Lợi Q1"
    );
    assert.equal(shipOrder.items, "1 áo");
    assert.match(shipOrder.note, /ship nhanh/i);

    const [sizeOrder] = parseLocallyVietnamese(
      "Chị L 0912345678 1 áo (size M) 220k 12 Lê Lợi Q1"
    );
    assert.equal(sizeOrder.items, "1 áo (size M)");
    assert.equal(sizeOrder.note, "");

    const [phoOrder] = parseLocallyVietnamese(
      "Tuấn 0986686887 phở thêm nhiều thịt ở 30/4 vũng tàu hẻm 808"
    );
    assert.equal(phoOrder.name, "Tuấn");
    assert.equal(phoOrder.phone, "0986686887");
    assert.equal(phoOrder.items, "phở thêm nhiều thịt");
    assert.equal(phoOrder.address, "30/4 vũng tàu hẻm 808");
  });

  it("handles cọc-còn, unit prices (/hộp, /1 ly, x 150k), SĐT người nhận, qty packing/suffix, Zalo PC, parens, and note tails", () => {
    const [cocCon] = parseLocallyVietnamese(
      "Chị Ly 0912345678 đặt 1 áo 250k - cọc 50k còn 200k - 10 Lê Lợi, Q1"
    );
    assert.equal(cocCon.total, 200000);
    assert.equal(cocCon.items, "1 áo");
    assert.match(cocCon.note, /cọc 50k/i);

    const [unit1] = parseLocallyVietnamese("Chị A 0912345678 3 hộp bánh giá 50k/hộp 12 Lê Lợi Q1");
    assert.equal(unit1.qty, 3);
    assert.equal(unit1.total, 150000);
    assert.equal(unit1.items, "3 hộp bánh");

    const [unit2] = parseLocallyVietnamese("Chị B 0912345678 2 ly trà sữa 35k/1 ly 12 Lê Lợi Q1");
    assert.equal(unit2.qty, 2);
    assert.equal(unit2.total, 70000);
    assert.equal(unit2.items, "2 ly trà sữa");

    const [unit3] = parseLocallyVietnamese("Chị C 0912345678 2 áo x 150k 12 Lê Lợi Q1");
    assert.equal(unit3.qty, 2);
    assert.equal(unit3.total, 300000);
    assert.equal(unit3.items, "2 áo");

    const recOrders = parseLocallyVietnamese(
      "Chị P 0912345678 1 áo 100k tới 10 Lê Lợi\nSĐT người nhận: 0987654321 (Anh Tuấn)"
    );
    assert.equal(recOrders.length, 1);
    assert.equal(recOrders[0].phone, "0912345678");
    assert.match(recOrders[0].note, /0987654321/);
    assert.match(recOrders[0].note, /Anh Tuấn/);

    const [packOrder] = parseLocallyVietnamese("Anh D 0912345678 1 thùng 24 lon bia 350k 12 Lê Lợi Q1");
    assert.equal(packOrder.qty, 1);

    const [suffixOrder] = parseLocallyVietnamese(
      "Chị E 0912345678 áo thun đen x2, quần trắng x1 tổng 450k 12 Lê Lợi Q1"
    );
    assert.equal(suffixOrder.qty, 3);
    assert.equal(suffixOrder.total, 450000);

    const [zaloOrder] = parseLocallyVietnamese(
      "[14:30 24/11/2026] Nguyễn Lan: Cho chị 2 cơm tấm 100k tới 10 Lê Lợi 0912345678"
    );
    assert.equal(zaloOrder.name, "Nguyễn Lan");
    assert.equal(zaloOrder.items, "2 cơm tấm");
    assert.equal(zaloOrder.total, 100000);
    assert.equal(zaloOrder.address, "10 Lê Lợi");

    const [parenColor] = parseLocallyVietnamese(
      "Chị F 0912345678 2 áo thun (1 đen, 1 trắng) 300k 12 Lê Lợi Q1"
    );
    assert.equal(parenColor.items, "2 áo thun (1 đen, 1 trắng)");
    assert.equal(parenColor.qty, 2);

    const [lhOrder] = parseLocallyVietnamese(
      "Chị G 0912345678 1 bánh 50k 10 Lê Lợi\nLH 0987654321 nếu không gọi được"
    );
    assert.equal(lhOrder.items, "1 bánh");
    assert.match(lhOrder.note, /nếu không gọi được/i);

    const [dateShort] = parseLocallyVietnamese(
      "Chị H 0912345678 1 bánh 50k giao 25/11 tới 10 Lê Lợi"
    );
    assert.equal(dateShort.items, "1 bánh");
    assert.equal(dateShort.address, "10 Lê Lợi");
    assert.match(dateShort.note, /giao 25\/11/i);
  });
});
