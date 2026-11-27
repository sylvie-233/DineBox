import type {
  ApiResponse,
  CreateOrderInput,
  Order,
  PublicBootstrap,
  PublicOrderListItem,
  PublicTableInfo,
} from '@dinebox/types';

/** 顾客端 API 错误：message 可直接展示。 */
export class PublicApiError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'PublicApiError';
    this.status = status;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  if (init?.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  const response = await fetch(`/api/public${path}`, {
    ...init,
    headers,
    cache: 'no-store',
  });
  const text = await response.text();
  let payload: ApiResponse<T> | null = null;
  try {
    payload = text ? (JSON.parse(text) as ApiResponse<T>) : null;
  } catch {
    throw new PublicApiError(response.status, '服务返回了无法解析的数据');
  }
  if (!response.ok || !payload || payload.code >= 400) {
    throw new PublicApiError(
      payload?.code ?? response.status,
      payload?.message ?? `请求失败（${response.status}）`,
    );
  }
  return payload.data;
}

/** 顾客端公开接口。 */
export const publicApi = {
  /** 扫码启动数据：门店 + 桌台 + 菜单。 */
  bootstrap(tableToken: string): Promise<PublicBootstrap> {
    return request(`/bootstrap?tk=${encodeURIComponent(tableToken)}`);
  },
  /** 仅校验桌台令牌。 */
  table(tableToken: string): Promise<PublicTableInfo> {
    return request(`/table?tk=${encodeURIComponent(tableToken)}`);
  },
  /** 提交订单（服务端按桌台当前就餐会话归属）。 */
  createOrder(input: CreateOrderInput): Promise<Order> {
    return request('/orders', { method: 'POST', body: JSON.stringify(input) });
  },
  /** 当前桌台本次就餐会话的订单列表。 */
  orders(tableToken: string): Promise<PublicOrderListItem[]> {
    return request(`/orders?tk=${encodeURIComponent(tableToken)}`);
  },
  /** 当前桌台本次就餐会话的订单详情。 */
  order(tableToken: string, orderNo: string): Promise<Order> {
    return request(
      `/orders/${encodeURIComponent(orderNo)}?tk=${encodeURIComponent(tableToken)}`,
    );
  },
};
