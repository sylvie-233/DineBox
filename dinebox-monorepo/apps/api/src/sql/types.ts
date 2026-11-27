/** 参数化 SQL 构建结果：业务服务通过 dbClient.query(sql, params) 执行。 */
export interface SqlQuery {
  sql: string;
  params: unknown[];
}
