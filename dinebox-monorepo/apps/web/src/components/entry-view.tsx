'use client';

import type { PublicTableInfo, ShopConfig } from '@dinebox/types';

function isOpen(shop: ShopConfig): boolean {
  const now = new Date();
  const current = now.getHours() * 60 + now.getMinutes();
  const parse = (value: string): number => {
    const [hour, minute] = value.split(':').map(Number);
    return (hour ?? 0) * 60 + (minute ?? 0);
  };
  const open = parse(shop.openTime);
  const close = parse(shop.closeTime);
  return close >= open
    ? current >= open && current <= close
    : current >= open || current <= close;
}

/** 入座页：桌号由二维码锁定，顾客只需选择就餐人数。 */
export function EntryView({
  shop,
  table,
  people,
  onPeopleChange,
  onStart,
}: {
  shop: ShopConfig;
  table: PublicTableInfo;
  people: number;
  onPeopleChange: (people: number) => void;
  onStart: () => void;
}) {
  const open = isOpen(shop);
  return (
    <div className="entry">
      <div className="entry-top">
        <div className="entry-logo">
          <span style={{ fontSize: 28, fontWeight: 900 }}>希</span>
        </div>
        <div className="entry-shop">{shop.shopName}</div>
        <div className="entry-scan">
          已通过桌台二维码识别桌号 · {open ? '营业中' : '已打烊'} {shop.openTime} -{' '}
          {shop.closeTime}
        </div>
      </div>

      <div className="entry-card">
        <div className="entry-table-row">
          <div>
            <div className="entry-table-label">当前桌号</div>
            <div className="entry-table-no">{table.name}</div>
          </div>
          <div className="entry-table-tip">
            桌号已由二维码锁定
            <br />
            如有误请联系服务员
          </div>
        </div>
        <div className="entry-people-label">
          请选择就餐人数
          <span style={{ fontWeight: 400, color: 'var(--ink-3)', fontSize: 11 }}>
            （{table.areaName}
            {table.seats ? ` · ${table.seats} 人桌` : ''}）
          </span>
        </div>
        <div className="people-grid">
          {Array.from({ length: 12 }, (_, index) => index + 1).map((value) => (
            <button
              key={value}
              type="button"
              className={`p-opt ${people === value ? 'active' : ''}`}
              onClick={() => onPeopleChange(value)}
            >
              {value === 12 ? '12+' : value}
            </button>
          ))}
        </div>
      </div>

      <button type="button" className="entry-btn" onClick={onStart}>
        开始点餐
      </button>

      <div className="entry-foot">
        下单后请到前台结账，本单暂不支持线上支付
        <br />
        如对菜品过敏或有忌口，请在点餐时填写备注
      </div>
    </div>
  );
}
