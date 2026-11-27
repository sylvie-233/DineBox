-- 仅为已存在的旧数据库执行一次；新库由 scripts/init/01-schema.sql 直接创建相关列。
-- 桌台就餐会话：同桌顾客共享；最后一批待结算订单结清/取消后自动换新会话。

USE `dinebox`;

ALTER TABLE `dining_table`
  ADD COLUMN `session_token` VARCHAR(64) NOT NULL DEFAULT ''
    COMMENT '当前就餐会话令牌；同桌顾客共享，结清后换新' AFTER `qr_token`;

UPDATE `dining_table`
   SET `session_token` = CONCAT('ts_', REPLACE(UUID(), '-', ''))
 WHERE `session_token` = '';

ALTER TABLE `orders`
  ADD COLUMN `session_token` VARCHAR(64) NOT NULL DEFAULT ''
    COMMENT '桌台就餐会话令牌（订单创建时写入；结清/取消后桌台换新会话）' AFTER `remark`,
  ADD KEY `idx_table_session` (`table_id`, `session_token`);

-- 在座顾客的未结订单归入桌台当前会话，升级后 H5「本桌订单」仍能看到；
-- 历史已结清/已取消订单保持空令牌，不再出现在顾客端。
UPDATE `orders` o
  JOIN `dining_table` t ON t.id = o.table_id
   SET o.`session_token` = t.`session_token`
 WHERE o.`status` = 'PENDING'
   AND o.`session_token` = '';
