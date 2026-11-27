/**
 * DineBox 演示数据生成器：生成 scripts/init/02-demo-data.sql。
 * 覆盖近 7 天已结清订单、今日待结算/挂单、打印日志与操作日志，
 * 打开后台报表、订单流水、打印日志与操作日志即可看到真实数据。
 *
 * 用法：node scripts/generate-demo-data.mjs
 */
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/** 固定随机种子，保证每次生成结果一致。 */
let seed = 20261127;
function random() {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
}
function pick(list) {
  return list[Math.floor(random() * list.length)];
}
function between(min, max) {
  return Math.floor(random() * (max - min + 1)) + min;
}
function round2(n) {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
function esc(value) {
  return String(value).replace(/'/g, "''");
}
function pad(n, width = 2) {
  return String(n).padStart(width, '0');
}
function dateStr(d) {
  const date = new Date();
  date.setDate(date.getDate() - d);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

// 与 01-schema.sql 示例菜品一致；只使用在售菜品。
const DISHES = [
  {
    id: 1,
    name: '招牌水煮牛肉',
    price: 42,
    specs: [
      { name: '份量', options: [['小份', 0], ['大份', 3]] },
      { name: '辣度', options: [['不辣', 0], ['微辣', 0], ['中辣', 0], ['特辣', 0]] },
    ],
    addons: [
      { id: 3, name: '加宽粉', price: 3 },
      { id: 4, name: '加豆腐', price: 3 },
      { id: 2, name: '加牛肉 50g', price: 9 },
    ],
  },
  {
    id: 2,
    name: '家常红烧肉',
    price: 36,
    specs: [{ name: '份量', options: [['小份', 0], ['大份', 2]] }],
    addons: [
      { id: 5, name: '加卤蛋', price: 2 },
      { id: 6, name: '加米饭', price: 2 },
    ],
  },
  { id: 3, name: '香辣小龙虾', price: 88, specs: [], addons: [] },
  {
    id: 5,
    name: '手工水饺(12只)',
    price: 22,
    specs: [{ name: '做法', options: [['水饺', 0], ['煎饺', 3]] }],
    addons: [{ id: 7, name: '加一份(6只)', price: 11 }],
  },
  {
    id: 6,
    name: '扬州炒饭',
    price: 18,
    specs: [{ name: '份量', options: [['小份', 0], ['大份', 6]] }],
    addons: [
      { id: 1, name: '加蛋', price: 2 },
      { id: 8, name: '加虾仁', price: 6 },
    ],
  },
  {
    id: 7,
    name: '葱油拌面',
    price: 12,
    specs: [],
    addons: [
      { id: 9, name: '加煎蛋', price: 2 },
      { id: 10, name: '加荷包蛋', price: 3 },
    ],
  },
  { id: 8, name: '番茄蛋花汤', price: 12, specs: [], addons: [] },
  {
    id: 9,
    name: '筒骨玉米汤',
    price: 22,
    specs: [{ name: '份量', options: [['例汤', 0], ['大盅', 8]] }],
    addons: [],
  },
  {
    id: 10,
    name: '手打柠檬茶',
    price: 13,
    specs: [
      { name: '温度', options: [['正常冰', 0], ['少冰', 0], ['去冰', 0], ['常温', 0]] },
      { name: '糖度', options: [['正常糖', 0], ['半糖', 0], ['无糖', 0]] },
    ],
    addons: [{ id: 11, name: '加小料(椰果)', price: 2 }],
  },
];

const TABLES = [1, 2, 3, 4, 5, 6, 7, 8, 9];
const PAY_METHODS = ['CASH', 'WECHAT_QR', 'ALIPAY_QR', 'OTHER'];
const RETURN_REASONS = ['顾客误点', '出餐太慢', '口感问题', '上错菜品'];
const REMARKS = ['', '', '', '少辣', '不要葱', '儿童餐具 ×1', '打包一份米饭'];

function makeItem() {
  const dish = pick(DISHES);
  const specNames = [];
  let specExtra = 0;
  for (const group of dish.specs) {
    const [name, diff] = pick(group.options);
    specNames.push(name);
    specExtra += diff;
  }
  const addons = [];
  let addonTotal = 0;
  for (const addon of dish.addons) {
    if (random() < 0.28) {
      const qty = addon.name === '加蛋' || addon.name === '加卤蛋' ? between(1, 2) : 1;
      addons.push({ ...addon, qty });
      addonTotal += addon.price * qty;
    }
  }
  const qty = random() < 0.75 ? 1 : 2;
  const unitPrice = round2(dish.price + specExtra + addonTotal);
  return {
    dishId: dish.id,
    dishName: dish.name,
    specText: specNames.join('/'),
    specExtra: round2(specExtra),
    unitPrice,
    qty,
    itemAmount: round2(unitPrice * qty),
    addons,
  };
}

const orderValues = [];
const itemValues = [];
const addonValues = [];
const printLogValues = [];
const opLogValues = [];

let orderId = 1001;
let itemId = 1;
let addonId = 1;
let seq = 0;

function sqlTime(d, hour, minute, offsetMinutes = 0) {
  if (d === 0) {
    return `DATE_SUB(NOW(), INTERVAL ${offsetMinutes} MINUTE)`;
  }
  return `TIMESTAMP('${dateStr(d)}', '${pad(hour)}:${pad(minute)}:00')`;
}

function addOrder({ d, hour, minute, offsetMinutes, tableId, people, items, status, remark, settledBy, payMethod, hung = 0, cancel = false }) {
  seq += 1;
  const datePart = dateStr(d).replace(/-/g, '');
  const orderNo = `DB${datePart}${String(9000 + seq).padStart(4, '0')}`;
  const createdSql = sqlTime(d, hour, minute, offsetMinutes);
  const settledSql = status === 'SETTLED' ? `DATE_ADD(${createdSql}, INTERVAL 38 MINUTE)` : 'NULL';
  const cancelledSql = cancel ? `DATE_ADD(${createdSql}, INTERVAL 6 MINUTE)` : 'NULL';

  let total = 0;
  const rows = items.map((item) => {
    const returned =
      status === 'SETTLED' && item.unitPrice <= 40 && random() < 0.02;
    if (!returned) {
      total += item.itemAmount;
    }
    return {
      ...item,
      status: returned ? 'RETURNED' : 'NORMAL',
      reason: returned ? pick(RETURN_REASONS) : '',
      returnedAt: returned
        ? `DATE_ADD(${createdSql}, INTERVAL 12 MINUTE)`
        : 'NULL',
    };
  });
  total = round2(total);
  const off = status === 'SETTLED' && total > 20 && random() < 0.55
    ? round2(total - Math.floor(total))
    : 0;
  const payable = round2(total - off);

  orderValues.push(
    `(${orderId}, '${orderNo}', ${tableId}, ${people}, '${status}', ${hung}, ${total.toFixed(2)}, ${off.toFixed(2)}, ${payable.toFixed(2)}, '${esc(remark)}', ${
      payMethod ? `'${payMethod}'` : 'NULL'
    }, ${settledBy ?? 'NULL'}, ${settledSql}, ${cancelledSql}, ${createdSql})`,
  );

  for (const item of rows) {
    const currentItemId = itemId++;
    itemValues.push(
      `(${currentItemId}, ${orderId}, ${item.dishId}, '${esc(item.dishName)}', '${esc(item.specText)}', ${item.specExtra.toFixed(2)}, ${item.unitPrice.toFixed(2)}, ${item.qty}, ${item.itemAmount.toFixed(2)}, '${item.status}', '${esc(item.reason)}', ${item.returnedAt}, ${item.status === 'RETURNED' ? settledBy ?? 'NULL' : 'NULL'})`,
    );
    for (const addon of item.addons) {
      const currentAddonId = addonId++;
      addonValues.push(
        `(${currentAddonId}, ${currentItemId}, ${addon.id}, '${esc(addon.name)}', ${addon.price.toFixed(2)}, ${addon.qty})`,
      );
    }
  }

  if (status === 'SETTLED') {
    const failed = random() < 0.04;
    printLogValues.push(
      `(${orderId}, 1, 'KITCHEN', '${failed ? 'FAIL' : 'SUCCESS'}', '${failed ? '连接超时：请检查打印机电源、IP 与网络是否同网段' : ''}', ${failed ? 1 : 0}, NULL, ${createdSql})`,
    );
    printLogValues.push(
      `(${orderId}, 2, 'BILL', 'SUCCESS', '', 0, ${settledBy}, ${settledSql})`,
    );
    opLogValues.push(
      `(NULL, '顾客', 'ORDER_CREATE', '${orderNo}', '${esc(remark ? `共 ${rows.length} 项 · 备注：${remark}` : `共 ${rows.length} 项`)}', '192.168.1.30', ${createdSql})`,
    );
    opLogValues.push(
      `(${settledBy}, '${settledBy === 1 ? 'admin' : 'cashier01'}', 'ORDER_SETTLE', '${orderNo}', '${payMethod} · 抹零¥${off.toFixed(2)} · 实收¥${payable.toFixed(2)}', '192.168.1.20', ${settledSql})`,
    );
    if (rows.some((row) => row.status === 'RETURNED')) {
      opLogValues.push(
        `(${settledBy}, '${settledBy === 1 ? 'admin' : 'cashier01'}', 'ITEM_RETURN', '${orderNo}', '退菜原因：口味问题', '192.168.1.20', DATE_ADD(${createdSql}, INTERVAL 12 MINUTE))`,
      );
    }
  } else {
    opLogValues.push(
      `(NULL, '顾客', 'ORDER_CREATE', '${orderNo}', '共 ${rows.length} 项 · 待结算', '192.168.1.31', ${createdSql})`,
    );
  }

  orderId += 1;
}

// 近 7 天已结清订单（每天 3~5 单）。
for (let d = 6; d >= 0; d -= 1) {
  const count = d === 0 ? 4 : between(3, 5);
  for (let i = 0; i < count; i += 1) {
    const hour = 11 + i * 2 + between(0, 1);
    const minute = pick([5, 15, 25, 35, 45, 50]);
    addOrder({
      d,
      hour,
      minute: Math.min(minute, 55),
      offsetMinutes: 35 + i * 55 + between(0, 20),
      tableId: pick(TABLES),
      people: between(2, 6),
      items: Array.from({ length: between(2, 3) }, makeItem),
      status: 'SETTLED',
      remark: pick(REMARKS),
      settledBy: pick([1, 2]),
      payMethod: pick(PAY_METHODS),
    });
  }
}

// 今日待结算 / 挂单（桌台卡片与收银操作演示）。
addOrder({
  d: 0,
  hour: 0,
  minute: 0,
  offsetMinutes: 25,
  tableId: 2,
  people: 2,
  items: [
    makeItemWith(1, '小份/微辣'),
    makeItemWith(2, '小份'),
    makeItemWith(8, ''),
  ],
  status: 'PENDING',
  remark: '少辣',
  settledBy: null,
  payMethod: null,
});

addOrder({
  d: 0,
  hour: 0,
  minute: 0,
  offsetMinutes: 18,
  tableId: 2,
  people: 2,
  items: [makeItemWith(6, '大份'), makeItemWith(10, '少冰/半糖')],
  status: 'PENDING',
  remark: '',
  settledBy: null,
  payMethod: null,
});

addOrder({
  d: 0,
  hour: 0,
  minute: 0,
  offsetMinutes: 42,
  tableId: 6,
  people: 4,
  items: [makeItemWith(3, '')],
  status: 'PENDING',
  remark: '不要香菜',
  settledBy: null,
  payMethod: null,
});

addOrder({
  d: 0,
  hour: 0,
  minute: 0,
  offsetMinutes: 65,
  tableId: 7,
  people: 2,
  items: [makeItemWith(5, '水饺'), makeItemWith(7, ''), makeItemWith(10, '去冰/无糖')],
  status: 'PENDING',
  remark: '',
  settledBy: null,
  payMethod: null,
  hung: 1,
});

function makeItemWith(dishId, specText) {
  const dish = DISHES.find((item) => item.id === dishId);
  if (!dish) {
    throw new Error(`dish ${dishId} not found`);
  }
  let specExtra = 0;
  if (dish.specs.length > 0) {
    const names = specText ? specText.split('/') : [];
    for (const group of dish.specs) {
      const chosen = group.options.find((option) => names.includes(option[0])) ?? group.options[0];
      specExtra += chosen[1];
    }
  }
  const unitPrice = round2(dish.price + specExtra);
  return {
    dishId: dish.id,
    dishName: dish.name,
    specText,
    specExtra: round2(specExtra),
    unitPrice,
    qty: 1,
    itemAmount: unitPrice,
    addons: [],
  };
}

// 打印日志补两条测试记录。
printLogValues.push(
  `(NULL, 1, 'TEST', 'SUCCESS', '', 0, 1, DATE_SUB(NOW(), INTERVAL 1 DAY))`,
);
printLogValues.push(
  `(NULL, 2, 'TEST', 'FAIL', '连接被拒绝：打印机未开机或未监听 9100 端口', 1, 1, DATE_SUB(NOW(), INTERVAL 1 DAY))`,
);

// 登录 / 配置类操作日志。
opLogValues.push(
  `(1, 'admin', 'LOGIN', 'admin', '登录成功（管理员）', '192.168.1.20', DATE_SUB(NOW(), INTERVAL 3 HOUR))`,
  `(2, 'cashier01', 'LOGIN', 'cashier01', '登录成功（收银员）', '192.168.1.21', DATE_SUB(NOW(), INTERVAL 2 HOUR))`,
  `(1, 'admin', 'CONFIG_UPDATE', '灶火人家·家常菜', '门店设置：营业 10:30-21:30；抹零开启（ANGLE）', '192.168.1.20', DATE_SUB(NOW(), INTERVAL 2 DAY))`,
  `(1, 'admin', 'PRINTER_TEST', '后厨打印机', '测试打印成功', '192.168.1.20', DATE_SUB(NOW(), INTERVAL 2 DAY))`,
  `(1, 'admin', 'DISH_SAVE', '招牌水煮牛肉', '编辑菜品', '192.168.1.20', DATE_SUB(NOW(), INTERVAL 3 DAY))`,
);

const sql = `-- ============================================================================
-- DineBox 演示数据（由 scripts/generate-demo-data.mjs 生成，勿手工修改）
-- 内容：近 7 天已结清订单、今日待结算/挂单、打印日志与操作日志。
-- 依赖：01-schema.sql 中的菜单、账号、菜品、桌台与打印机种子数据。
-- ============================================================================

SET NAMES utf8mb4;

INSERT INTO \`orders\`
  (\`id\`, \`order_no\`, \`table_id\`, \`people_count\`, \`status\`, \`hung_flag\`,
   \`total_amount\`, \`round_off_amount\`, \`payable_amount\`, \`remark\`, \`pay_method\`,
   \`settled_by\`, \`settled_at\`, \`cancelled_at\`, \`created_at\`)
VALUES
  ${orderValues.join(',\n  ')};

INSERT INTO \`order_item\`
  (\`id\`, \`order_id\`, \`dish_id\`, \`dish_name\`, \`spec_text\`, \`spec_extra_price\`,
   \`unit_price\`, \`qty\`, \`item_amount\`, \`item_status\`, \`return_reason\`,
   \`returned_at\`, \`returned_by\`)
VALUES
  ${itemValues.join(',\n  ')};

INSERT INTO \`order_item_addon\`
  (\`id\`, \`item_id\`, \`addon_id\`, \`addon_name\`, \`addon_price\`, \`qty\`)
VALUES
  ${addonValues.join(',\n  ')};

INSERT INTO \`print_log\`
  (\`order_id\`, \`printer_id\`, \`doc_type\`, \`status\`, \`fail_reason\`, \`retry_count\`, \`printed_by\`, \`created_at\`)
VALUES
  ${printLogValues.join(',\n  ')};

INSERT INTO \`sys_operation_log\`
  (\`user_id\`, \`username\`, \`action\`, \`target\`, \`detail\`, \`ip\`, \`created_at\`)
VALUES
  ${opLogValues.join(',\n  ')};

-- 自增起点后移，避免演示数据 ID 与后续真实数据冲突。
ALTER TABLE \`orders\` AUTO_INCREMENT = ${orderId};
ALTER TABLE \`order_item\` AUTO_INCREMENT = ${itemId};
ALTER TABLE \`order_item_addon\` AUTO_INCREMENT = ${addonId};
`;

const target = resolve(__dirname, 'init/02-demo-data.sql');
writeFileSync(target, sql, 'utf8');
console.log(
  `已生成 ${target}：${orderValues.length} 单 / ${itemValues.length} 明细 / ${printLogValues.length} 打印日志 / ${opLogValues.length} 操作日志`,
);
