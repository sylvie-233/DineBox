-- ============================================================================
-- 扫码点餐系统｜最小版本【局域网打印版】 MySQL 数据库设计 v1
-- ============================================================================
-- 对应文档：
--   docs/扫码点餐系统-功能清单-v1.md
--   docs/扫码点餐系统-顾客H5原型-v1.html
--   docs/扫码点餐系统-admin管理端原型-v1.html
--
-- 环境要求：MySQL 8.0+ / InnoDB / utf8mb4
-- 设计约定：
--   1. 单店模型（清单明确不含多门店连锁），门店级信息放 sys_config
--   2. 订单金额口径：total_amount(菜品合计，退菜已扣)
--      = SUM(order_item.item_amount WHERE item_status='NORMAL')
--      payable_amount(应收) = total_amount - round_off_amount(抹零)
--   3. 业务实体（分类/菜品/桌台/加料/打印机）使用软删除 is_deleted，
--      订单明细冗余快照字段（名称/单价），保证历史订单不受菜品改动影响
--   4. 桌台实时状态（空闲/待结算/挂单）不落库，由订单表实时推导（见文末示例查询）
--   5. 字符集统一 utf8mb4，时间统一 DATETIME（应用层存本地时间，单店内网无时区问题）
-- ============================================================================

CREATE DATABASE IF NOT EXISTS `dinebox`
  DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
USE `dinebox`;

SET NAMES utf8mb4;

-- ============================================================================
-- 一、系统与权限模块（sys_）
-- ============================================================================

-- 1.1 后台用户表（清单 2.1 / 2.3.6：账号密码登录、Token 鉴权、新增/禁用账号）
DROP TABLE IF EXISTS `sys_user`;
CREATE TABLE `sys_user` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '用户ID',
  `username`      VARCHAR(32)  NOT NULL COMMENT '登录账号',
  `password_hash` VARCHAR(100) NOT NULL COMMENT '密码哈希（bcrypt，禁存明文）',
  `real_name`     VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '姓名/昵称',
  `role`          ENUM('ADMIN','CASHIER') NOT NULL DEFAULT 'CASHIER' COMMENT '角色：ADMIN管理员 / CASHIER收银员',
  `status`        ENUM('ENABLED','DISABLED') NOT NULL DEFAULT 'ENABLED' COMMENT '账号状态：ENABLED启用 / DISABLED禁用',
  `last_login_at` DATETIME     NULL COMMENT '最后登录时间',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted`    TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '软删除：0否 1是',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB COMMENT='后台用户表';

-- 1.2 菜单表（清单 2.3.6：角色菜单权限配置，即原型侧边栏 8 个菜单）
DROP TABLE IF EXISTS `sys_menu`;
CREATE TABLE `sys_menu` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '菜单ID',
  `menu_code`  VARCHAR(32) NOT NULL COMMENT '菜单编码（对应前端路由）：cashier/dishes/tables/printer/orders/reports/audit/settings',
  `menu_name`  VARCHAR(32) NOT NULL COMMENT '菜单名称：收银台/菜品管理/桌台管理/打印配置/订单流水/轻量报表/操作日志/系统设置',
  `sort`       INT         NOT NULL DEFAULT 0 COMMENT '显示顺序',
  `status`     ENUM('ENABLED','DISABLED') NOT NULL DEFAULT 'ENABLED' COMMENT '菜单状态',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_menu_code` (`menu_code`)
) ENGINE=InnoDB COMMENT='菜单表';

-- 1.3 角色菜单权限表（清单 2.3.6：管理员固定全量；收银员按配置可见）
--     前端过滤 + 后端接口鉴权双重控制，本表即鉴权依据
DROP TABLE IF EXISTS `sys_role_menu`;
CREATE TABLE `sys_role_menu` (
  `id`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `role`     ENUM('ADMIN','CASHIER') NOT NULL COMMENT '角色',
  `menu_id`  BIGINT UNSIGNED NOT NULL COMMENT '菜单ID',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_role_menu` (`role`, `menu_id`),
  KEY `idx_menu_id` (`menu_id`),
  CONSTRAINT `fk_rm_menu` FOREIGN KEY (`menu_id`) REFERENCES `sys_menu` (`id`)
) ENGINE=InnoDB COMMENT='角色菜单权限表';

-- 1.4 系统配置表（清单 2.3.6：门店名称、小票抬头、抹零全局开关；顾客端 SHOP 信息由此下发）
DROP TABLE IF EXISTS `sys_config`;
CREATE TABLE `sys_config` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `config_key`   VARCHAR(64)  NOT NULL COMMENT '配置键',
  `config_value` VARCHAR(255) NOT NULL DEFAULT '' COMMENT '配置值',
  `remark`       VARCHAR(100) NOT NULL DEFAULT '' COMMENT '说明',
  `updated_by`   BIGINT UNSIGNED NULL COMMENT '最后修改人',
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_config_key` (`config_key`)
) ENGINE=InnoDB COMMENT='系统配置表（KV）';

-- 1.5 上传文件表（清单 三：文件上传·菜品图片内网本地存储）
DROP TABLE IF EXISTS `sys_file`;
CREATE TABLE `sys_file` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '文件ID',
  `file_name`   VARCHAR(128) NOT NULL COMMENT '原始文件名',
  `file_path`   VARCHAR(255) NOT NULL COMMENT '存储相对路径（内网本地磁盘）',
  `file_size`   INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '文件大小（字节）',
  `mime_type`   VARCHAR(64)  NOT NULL DEFAULT '' COMMENT 'MIME 类型',
  `biz_type`    VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '业务类型：DISH_IMAGE菜品图等',
  `uploaded_by` BIGINT UNSIGNED NULL COMMENT '上传人 user_id',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '上传时间',
  PRIMARY KEY (`id`),
  KEY `idx_biz_type` (`biz_type`)
) ENGINE=InnoDB COMMENT='上传文件表';

-- 1.6 操作日志表（清单 三：下单、结算、退菜、打印、账号操作日志持久化）
DROP TABLE IF EXISTS `sys_operation_log`;
CREATE TABLE `sys_operation_log` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `user_id`     BIGINT UNSIGNED NULL COMMENT '操作人（顾客下单类操作为 NULL）',
  `username`    VARCHAR(32)  NOT NULL DEFAULT '' COMMENT '操作人账号快照',
  `action`      VARCHAR(32)  NOT NULL COMMENT '动作：LOGIN/ORDER_CREATE/ORDER_MODIFY/ITEM_RETURN/ORDER_CANCEL/ORDER_HUNG/ORDER_SETTLE/PRINT/PRINTER_TEST/USER_ADD/CONFIG_UPDATE 等',
  `target`      VARCHAR(64)  NOT NULL DEFAULT '' COMMENT '操作对象标识（如订单号、打印机ID）',
  `detail`      VARCHAR(500) NOT NULL DEFAULT '' COMMENT '详情（如退菜原因、改动内容摘要）',
  `ip`          VARCHAR(45)  NOT NULL DEFAULT '' COMMENT '操作来源IP',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '操作时间',
  PRIMARY KEY (`id`),
  KEY `idx_user_id` (`user_id`),
  KEY `idx_action` (`action`),
  KEY `idx_created_at` (`created_at`)
) ENGINE=InnoDB COMMENT='操作日志表';

-- ============================================================================
-- 二、菜品模块（dish_）：分类 / 菜品 / 规格组 / 规格选项 / 加料 / 加料绑定
-- ============================================================================

-- 2.1 菜品分类表（清单 2.3.1：新增、编辑、删除、排序；顾客端分类展示）
DROP TABLE IF EXISTS `dish_category`;
CREATE TABLE `dish_category` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '分类ID',
  `cat_name`   VARCHAR(32) NOT NULL COMMENT '分类名称：热销推荐/招牌主食/饮品甜点等',
  `sort`       INT         NOT NULL DEFAULT 0 COMMENT '排序值（越小越靠前，上移/下移即调整此值）',
  `status`     ENUM('ENABLED','DISABLED') NOT NULL DEFAULT 'ENABLED' COMMENT '启用状态',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '软删除：0否 1是',
  PRIMARY KEY (`id`),
  KEY `idx_sort` (`sort`)
) ENGINE=InnoDB COMMENT='菜品分类表';

-- 2.2 菜品表（清单 2.3.1：名称、图片、售价、所属分类、排序、上架下架、售罄；关键词搜索）
DROP TABLE IF EXISTS `dish`;
CREATE TABLE `dish` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '菜品ID',
  `category_id`  BIGINT UNSIGNED NOT NULL COMMENT '所属分类ID',
  `dish_name`    VARCHAR(64)  NOT NULL COMMENT '菜品名称',
  `description`  VARCHAR(200) NOT NULL DEFAULT '' COMMENT '卖点描述（顾客端卡片副标题）',
  `image_file_id` BIGINT UNSIGNED NULL COMMENT '图片文件ID（sys_file）',
  `price`        DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '基础售价（元）；规格差价在此基础上累加',
  `sort`         INT          NOT NULL DEFAULT 0 COMMENT '分类内排序值',
  `status`       ENUM('ON','OFF') NOT NULL DEFAULT 'ON' COMMENT '上架状态：ON在售 / OFF已下架（下架不可点单）',
  `sold_out`     TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '售罄标记：1售罄（顾客端置灰不可选）',
  `created_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`   DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted`   TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '软删除：0否 1是',
  PRIMARY KEY (`id`),
  KEY `idx_category_id` (`category_id`),
  KEY `idx_sort` (`sort`),
  KEY `idx_name` (`dish_name`),
  CONSTRAINT `fk_dish_category` FOREIGN KEY (`category_id`) REFERENCES `dish_category` (`id`),
  CONSTRAINT `fk_dish_file` FOREIGN KEY (`image_file_id`) REFERENCES `sys_file` (`id`)
) ENGINE=InnoDB COMMENT='菜品表';

-- 2.3 规格组表（清单 2.3.1 规格组管理；顾客端逐组选择，如：份量、辣度、温度）
DROP TABLE IF EXISTS `dish_spec_group`;
CREATE TABLE `dish_spec_group` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '规格组ID',
  `dish_id`    BIGINT UNSIGNED NOT NULL COMMENT '菜品ID',
  `group_name` VARCHAR(32) NOT NULL COMMENT '组名：份量/辣度/糖度等',
  `sort`       INT         NOT NULL DEFAULT 0 COMMENT '组显示顺序',
  PRIMARY KEY (`id`),
  KEY `idx_dish_id` (`dish_id`),
  CONSTRAINT `fk_spec_group_dish` FOREIGN KEY (`dish_id`) REFERENCES `dish` (`id`)
) ENGINE=InnoDB COMMENT='菜品规格组表';

-- 2.4 规格选项表（清单 2.3.1：选项差价，如 大份 +3 元；顾客端按所选规格计价）
DROP TABLE IF EXISTS `dish_spec_option`;
CREATE TABLE `dish_spec_option` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '选项ID',
  `group_id`    BIGINT UNSIGNED NOT NULL COMMENT '规格组ID',
  `option_name` VARCHAR(32) NOT NULL COMMENT '选项名：小份/大份/微辣等',
  `price_diff`  DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '差价（元），可为负；0 表示不变价',
  `sort`        INT         NOT NULL DEFAULT 0 COMMENT '选项显示顺序',
  PRIMARY KEY (`id`),
  KEY `idx_group_id` (`group_id`),
  CONSTRAINT `fk_spec_option_group` FOREIGN KEY (`group_id`) REFERENCES `dish_spec_group` (`id`)
) ENGINE=InnoDB COMMENT='菜品规格选项表';

-- 2.5 加料表（清单 2.3.1：加料名称、加价金额、每单限选数量；限选 0 = 不限）
DROP TABLE IF EXISTS `addon`;
CREATE TABLE `addon` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '加料ID',
  `addon_name` VARCHAR(32) NOT NULL COMMENT '加料名称：加蛋/加宽粉等',
  `price`      DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '加价金额（元）',
  `max_select` INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '每单限选数量：0 = 不限；≥1 顾客端按限选控制',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '软删除：0否 1是',
  PRIMARY KEY (`id`)
) ENGINE=InnoDB COMMENT='加料表';

-- 2.6 菜品-加料绑定表（清单 2.3.1：绑定菜品；顾客端仅展示所绑菜品的加料）
DROP TABLE IF EXISTS `dish_addon`;
CREATE TABLE `dish_addon` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `dish_id`    BIGINT UNSIGNED NOT NULL COMMENT '菜品ID',
  `addon_id`   BIGINT UNSIGNED NOT NULL COMMENT '加料ID',
  `sort`       INT         NOT NULL DEFAULT 0 COMMENT '显示顺序',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_dish_addon` (`dish_id`, `addon_id`),
  KEY `idx_addon_id` (`addon_id`),
  CONSTRAINT `fk_da_dish` FOREIGN KEY (`dish_id`) REFERENCES `dish` (`id`),
  CONSTRAINT `fk_da_addon` FOREIGN KEY (`addon_id`) REFERENCES `addon` (`id`)
) ENGINE=InnoDB COMMENT='菜品-加料绑定表';

-- ============================================================================
-- 三、桌台模块（table_）：区域 / 桌台（二维码）
-- ============================================================================

-- 3.1 桌台区域表（清单 2.3.2：区域新增、编辑、删除，桌台归属区域）
DROP TABLE IF EXISTS `dining_area`;
CREATE TABLE `dining_area` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '区域ID',
  `area_name`  VARCHAR(32) NOT NULL COMMENT '区域名称：A区/B区/大厅/包间',
  `sort`       INT         NOT NULL DEFAULT 0 COMMENT '排序值',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '软删除：0否 1是（有桌台引用时禁止删除）',
  PRIMARY KEY (`id`),
  KEY `idx_sort` (`sort`)
) ENGINE=InnoDB COMMENT='桌台区域表';

-- 3.2 桌台表（清单 2.3.2：新增、编辑、删除；二维码绑定 tableId；
--     桌号锁定不可改——顾客端以 qr_token 定位桌台，无修改桌号入口）
--     注：生产环境二维码统一使用 qr_token（不暴露自增 tableId，防遍历）；
--     原型为演示简化，链接直传桌台名（?t=A-05），实现时以本表 qr_token 为准
--     实时状态（空闲/待结算/挂单）由 orders 推导，不在此冗余（见文末示例查询 4）
DROP TABLE IF EXISTS `dining_table`;
CREATE TABLE `dining_table` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '桌台ID（即二维码内 tableId）',
  `area_id`    BIGINT UNSIGNED NOT NULL COMMENT '所属区域ID',
  `table_name` VARCHAR(32) NOT NULL COMMENT '桌台名称：A-01/A-02',
  `seats`      INT UNSIGNED NULL COMMENT '容纳人数（可选，供展示）',
  `qr_token`   VARCHAR(32) NOT NULL COMMENT '二维码令牌：链接形如 h5?tk={qr_token}，扫码即锁定此桌',
  `session_token` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '当前就餐会话令牌；同桌顾客共享，结清后换新',
  `created_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at` DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted` TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '软删除：0否 1是',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_qr_token` (`qr_token`),
  UNIQUE KEY `uk_table_name` (`table_name`),
  KEY `idx_area_id` (`area_id`),
  CONSTRAINT `fk_table_area` FOREIGN KEY (`area_id`) REFERENCES `dining_area` (`id`)
) ENGINE=InnoDB COMMENT='桌台表';

-- ============================================================================
-- 四、订单模块（order_）：订单 / 明细 / 明细加料
--     状态流转：PENDING(待结算) → SETTLED(已结清) / CANCELLED(已取消)
--     挂单为待结算下的暂存态（hung_flag=1），不改变 status
-- ============================================================================

-- 4.1 订单表（清单 一 / 2.2 / 2.3.4）
DROP TABLE IF EXISTS `orders`;
CREATE TABLE `orders` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '订单ID',
  `order_no`         VARCHAR(32)  NOT NULL COMMENT '订单号（展示给顾客与前台，如 DB202611270001）',
  `table_id`         BIGINT UNSIGNED NOT NULL COMMENT '桌台ID（扫码锁定）',
  `people_count`     INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '就餐人数（顾客入座页选择）',
  `status`           ENUM('PENDING','SETTLED','CANCELLED') NOT NULL DEFAULT 'PENDING' COMMENT '订单状态：待结算/已结清/已取消',
  `hung_flag`        TINYINT(1)   NOT NULL DEFAULT 0 COMMENT '挂单标记：1=挂单暂存（仅 PENDING 态有效），不结算保留在桌台列表',
  `total_amount`     DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '菜品合计（元，退菜明细已扣除）',
  `round_off_amount` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '抹零金额（元，sys_config.round_off_enabled 开关控制）',
  `payable_amount`   DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '应收金额（元）= total_amount - round_off_amount',
  `remark`           VARCHAR(200) NOT NULL DEFAULT '' COMMENT '整单备注（少辣、不要葱等）',
  `session_token` VARCHAR(64) NOT NULL DEFAULT '' COMMENT '桌台就餐会话令牌（订单创建时写入；结清/取消后桌台换新会话）',
  `pay_method`       ENUM('CASH','WECHAT_QR','ALIPAY_QR','OTHER') NULL COMMENT '结算方式：现金/前台微信静态码/前台支付宝静态码/其他（结算时填写，系统不校验支付结果）',
  `settled_by`       BIGINT UNSIGNED NULL COMMENT '结算操作人 user_id',
  `settled_at`       DATETIME     NULL COMMENT '结算时间',
  `cancelled_at`     DATETIME     NULL COMMENT '整单取消时间',
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '下单时间（顾客提交）',
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_order_no` (`order_no`),
  KEY `idx_table_status` (`table_id`, `status`),
  KEY `idx_table_session` (`table_id`, `session_token`),
  KEY `idx_status_created` (`status`, `created_at`),
  KEY `idx_created_at` (`created_at`),
  KEY `idx_settled_by` (`settled_by`),
  CONSTRAINT `fk_order_table` FOREIGN KEY (`table_id`) REFERENCES `dining_table` (`id`),
  CONSTRAINT `fk_order_settler` FOREIGN KEY (`settled_by`) REFERENCES `sys_user` (`id`)
) ENGINE=InnoDB COMMENT='订单表';

-- 4.2 订单明细表（快照冗余：菜品名/单价不随菜品改动变化；支持单品退菜）
DROP TABLE IF EXISTS `order_item`;
CREATE TABLE `order_item` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '明细ID',
  `order_id`         BIGINT UNSIGNED NOT NULL COMMENT '订单ID',
  `dish_id`          BIGINT UNSIGNED NULL COMMENT '菜品ID（菜品软删后仍可追溯，NULL 仅兜底）',
  `dish_name`        VARCHAR(64) NOT NULL COMMENT '菜品名称快照',
  `spec_text`        VARCHAR(100) NOT NULL DEFAULT '' COMMENT '规格文本快照：小份/微辣（组按顺序 / 连接）',
  `spec_extra_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '规格差价合计（元，所选选项 price_diff 之和）',
  `unit_price`       DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '成交单价（元）= 菜品售价 + spec_extra_price',
  `qty`              INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '数量（改单可调整）',
  `item_amount`      DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '明细小计（元）= unit_price × qty（退菜后不再计入合计）',
  `item_status`      ENUM('NORMAL','RETURNED') NOT NULL DEFAULT 'NORMAL' COMMENT '明细状态：正常/已退菜（单品退菜）',
  `return_reason`    VARCHAR(100) NOT NULL DEFAULT '' COMMENT '退菜原因（可选填写）',
  `returned_at`      DATETIME     NULL COMMENT '退菜时间',
  `returned_by`      BIGINT UNSIGNED NULL COMMENT '退菜操作人 user_id',
  `created_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`       DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_dish_id` (`dish_id`),
  KEY `idx_item_status` (`item_status`),
  CONSTRAINT `fk_item_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_item_dish` FOREIGN KEY (`dish_id`) REFERENCES `dish` (`id`),
  CONSTRAINT `fk_item_returner` FOREIGN KEY (`returned_by`) REFERENCES `sys_user` (`id`)
) ENGINE=InnoDB COMMENT='订单明细表';

-- 4.3 订单明细加料表（明细级加料快照：名称/价格不随加料配置变化；×N 数量对应 max_select）
DROP TABLE IF EXISTS `order_item_addon`;
CREATE TABLE `order_item_addon` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '主键',
  `item_id`     BIGINT UNSIGNED NOT NULL COMMENT '订单明细ID',
  `addon_id`    BIGINT UNSIGNED NULL COMMENT '加料ID（加料软删后仍可追溯）',
  `addon_name`  VARCHAR(32) NOT NULL COMMENT '加料名称快照：加蛋',
  `addon_price` DECIMAL(10,2) NOT NULL DEFAULT 0.00 COMMENT '加价快照（元/份）',
  `qty`         INT UNSIGNED NOT NULL DEFAULT 1 COMMENT '份数（限选数量 > 1 时可多份，如 加蛋×2）',
  PRIMARY KEY (`id`),
  KEY `idx_item_id` (`item_id`),
  CONSTRAINT `fk_ia_item` FOREIGN KEY (`item_id`) REFERENCES `order_item` (`id`),
  CONSTRAINT `fk_ia_addon` FOREIGN KEY (`addon_id`) REFERENCES `addon` (`id`)
) ENGINE=InnoDB COMMENT='订单明细加料表';

-- ============================================================================
-- 五、打印模块（print_）：打印机 / 模板 / 打印日志
-- ============================================================================

-- 5.1 打印机表（清单 2.3.3：名称、内网IP、端口默认9100、用途；RAW TCP 9100 ESC/POS）
DROP TABLE IF EXISTS `printer`;
CREATE TABLE `printer` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '打印机ID',
  `printer_name`  VARCHAR(64) NOT NULL COMMENT '打印机名称：后厨打印机/前台打印机',
  `ip`            VARCHAR(15) NOT NULL COMMENT '内网静态 IP（路由器绑定，防 IP 变动）',
  `port`          SMALLINT UNSIGNED NOT NULL DEFAULT 9100 COMMENT '端口（RAW TCP，默认 9100）',
  `purpose`       ENUM('KITCHEN','BILL','ALL') NOT NULL DEFAULT 'KITCHEN' COMMENT '用途：KITCHEN后厨小票 / BILL结账单 / ALL通用',
  `status`        ENUM('ONLINE','OFFLINE') NOT NULL DEFAULT 'OFFLINE' COMMENT '连通状态（测试打印后更新；新增默认 OFFLINE）',
  `last_test_at`  DATETIME    NULL COMMENT '最近连通测试时间',
  `created_at`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  `updated_at`    DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  `is_deleted`    TINYINT(1)  NOT NULL DEFAULT 0 COMMENT '软删除：0否 1是',
  PRIMARY KEY (`id`),
  KEY `idx_purpose` (`purpose`)
) ENGINE=InnoDB COMMENT='打印机表';

-- 5.2 打印模板表（清单 2.3.3：后厨小票 / 结账单 ESC/POS 模板编辑器，保存即生效）
--     变量占位（与 admin 原型模板编辑器一致）：
--     {title}小票抬头 {table}桌号 {order_no}订单号 {time}时间 {items}明细 {note}备注 {total}合计 {off}抹零 {payable}应收
DROP TABLE IF EXISTS `print_template`;
CREATE TABLE `print_template` (
  `id`               BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '模板ID',
  `template_type`    ENUM('KITCHEN','BILL') NOT NULL COMMENT '模板类型：KITCHEN后厨小票 / BILL结账单',
  `template_content` TEXT        NOT NULL COMMENT 'ESC/POS 模板内容（占位变量渲染为字节流）',
  `updated_by`       BIGINT UNSIGNED NULL COMMENT '最后修改人 user_id',
  `updated_at`       DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_template_type` (`template_type`)
) ENGINE=InnoDB COMMENT='打印模板表';

-- 5.3 打印日志表（清单 2.3.3：订单、打印机、时间、状态、失败原因；支持手动重打）
DROP TABLE IF EXISTS `print_log`;
CREATE TABLE `print_log` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT COMMENT '日志ID',
  `order_id`     BIGINT UNSIGNED NULL COMMENT '订单ID（测试打印为 NULL）',
  `printer_id`   BIGINT UNSIGNED NOT NULL COMMENT '打印机ID',
  `doc_type`     ENUM('KITCHEN','BILL','TEST') NOT NULL COMMENT '单据类型：后厨小票/结账单/测试页',
  `status`       ENUM('SUCCESS','FAIL') NOT NULL COMMENT '打印状态',
  `fail_reason`  VARCHAR(255) NOT NULL DEFAULT '' COMMENT '失败原因：连接超时/连接拒绝/写入失败等',
  `retry_count`  INT UNSIGNED NOT NULL DEFAULT 0 COMMENT '累计重打次数（手动重打累加）',
  `printed_by`   BIGINT UNSIGNED NULL COMMENT '触发/重打操作人 user_id',
  `created_at`   DATETIME    NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '打印时间',
  PRIMARY KEY (`id`),
  KEY `idx_order_id` (`order_id`),
  KEY `idx_printer_id` (`printer_id`),
  KEY `idx_created_at` (`created_at`),
  CONSTRAINT `fk_pl_order` FOREIGN KEY (`order_id`) REFERENCES `orders` (`id`),
  CONSTRAINT `fk_pl_printer` FOREIGN KEY (`printer_id`) REFERENCES `printer` (`id`)
) ENGINE=InnoDB COMMENT='打印日志表';

-- ============================================================================
-- 六、初始化数据
-- ============================================================================

-- 6.1 菜单（与原型侧边栏一致）
INSERT INTO `sys_menu` (`id`, `menu_code`, `menu_name`, `sort`) VALUES
  (1, 'cashier',  '收银台',     1),
  (2, 'dishes',   '菜品管理',   2),
  (3, 'tables',   '桌台管理',   3),
  (4, 'printer',  '打印配置',   4),
  (5, 'orders',   '订单流水',   5),
  (6, 'reports',  '轻量报表',   6),
  (7, 'audit',    '操作日志',   7),
  (8, 'settings', '系统设置',   8);

-- 6.2 初始账号（密码为 bcrypt 哈希占位，上线前务必替换；初始密码 123456 / cashier123）
INSERT INTO `sys_user` (`username`, `password_hash`, `real_name`, `role`, `status`) VALUES
  ('admin',     '$2a$10$REPLACE_ME_BCRYPT_HASH_1', '店长',     'ADMIN',   'ENABLED'),
  ('cashier01', '$2a$10$REPLACE_ME_BCRYPT_HASH_2', '前台小张', 'CASHIER', 'ENABLED');

-- 6.3 角色菜单权限：管理员全量；收银员默认仅收银台（后台可配置）
INSERT INTO `sys_role_menu` (`role`, `menu_id`) VALUES
  ('ADMIN', 1), ('ADMIN', 2), ('ADMIN', 3), ('ADMIN', 4), ('ADMIN', 5), ('ADMIN', 6), ('ADMIN', 7), ('ADMIN', 8),
  ('CASHIER', 1);

-- 6.4 系统配置（门店信息顾客端展示由此下发）
INSERT INTO `sys_config` (`config_key`, `config_value`, `remark`) VALUES
  ('shop_name',         '灶火人家·家常菜', '门店名称'),
  ('receipt_title',     '灶火人家·家常菜 欢迎光临', '小票抬头'),
  ('shop_open_time',    '10:30',           '营业开始时间（顾客端顶部展示）'),
  ('shop_close_time',   '21:30',           '营业结束时间（顾客端顶部展示）'),
  ('round_off_enabled', '1',               '抹零开关：1开启 0关闭'),
  ('round_off_rule',    'ANGLE',           '抹零规则：ANGLE抹到元 / ANGLE5抹到5角 / NONE');

-- 6.5 打印模板默认内容（与 admin 原型默认模板一致；占位变量见 5.2 注释，可在后台编辑）
INSERT INTO `print_template` (`template_type`, `template_content`) VALUES
  ('KITCHEN', '【后厨单】{table}桌\n单号：{order_no}\n--------------------------------\n{items}\n--------------------------------\n备注：{note}\n下单时间：{time}'),
  ('BILL',    '{title}\n结账单\n单号：{order_no}\n--------------------------------\n桌号：{table}\n{items}\n--------------------------------\n合计：{total}\n抹零：{off}\n应收：{payable}\n{time}');

-- 6.6 示例业务数据（与 admin 原型种子一致，仅供联调演示，可清空）
INSERT INTO `dining_area` (`id`, `area_name`, `sort`) VALUES
  (1, 'A区', 1), (2, 'B区', 2), (3, 'C区', 3), (4, '包间', 4);

INSERT INTO `dining_table` (`area_id`, `table_name`, `seats`, `qr_token`) VALUES
  (1, 'A-01',    4, 'tk_a1x9k2m4'), (1, 'A-02', 4, 'tk_b7q3n8w5'),
  (1, 'A-03',    4, 'tk_c2r6t1y8'), (1, 'A-05', 6, 'tk_d5s9u3z6'),
  (2, 'B-02',    4, 'tk_e8v4x2k7'), (2, 'B-06', 4, 'tk_f3w7y5m9'),
  (3, 'C-01',    2, 'tk_g6x8z2n4'), (3, 'C-04', 2, 'tk_h9y3a6p8'),
  (4, '包间-01', 10, 'tk_j2z5b8q3');

UPDATE `dining_table` SET `session_token` = CONCAT('ts_', REPLACE(UUID(), '-', '')) WHERE `session_token` = '';

INSERT INTO `dish_category` (`id`, `cat_name`, `sort`) VALUES
  (1, '热销推荐', 1), (3, '招牌主食', 2), (2, '小吃凉菜', 3),
  (4, '汤品',     4), (5, '饮品甜点', 5);

INSERT INTO `dish` (`id`, `category_id`, `dish_name`, `description`, `price`, `sort`, `status`, `sold_out`) VALUES
  (1,  1, '招牌水煮牛肉', '麻辣鲜香 · 招牌必点', 42.00, 1, 'ON', 0),
  (2,  1, '家常红烧肉',   '肥而不腻 · 入口即化', 36.00, 2, 'ON', 0),
  (3,  1, '香辣小龙虾',   '当季鲜活 · 现杀现烧', 88.00, 3, 'ON', 0),
  (4,  2, '凉拌木耳',     '爽脆开胃',             14.00, 1, 'ON', 1),
  (5,  3, '手工水饺(12只)', '每日现包 · 猪肉白菜馅', 22.00, 1, 'ON', 0),
  (6,  3, '扬州炒饭',     '粒粒分明 · 配料丰富', 18.00, 2, 'ON', 0),
  (7,  3, '葱油拌面',     '秘制葱油 · 香气十足', 12.00, 3, 'ON', 0),
  (8,  4, '番茄蛋花汤',   '酸甜开胃',             12.00, 1, 'ON', 0),
  (9,  4, '筒骨玉米汤',   '慢火熬制 3 小时',     22.00, 2, 'ON', 0),
  (10, 5, '手打柠檬茶',   '现捶香水柠檬',         13.00, 1, 'ON', 0);

INSERT INTO `dish_spec_group` (`id`, `dish_id`, `group_name`, `sort`) VALUES
  (1, 1, '份量', 1), (2, 1, '辣度', 2),
  (3, 2, '份量', 1),
  (4, 5, '做法', 1),
  (5, 6, '份量', 1),
  (6, 9, '份量', 1),
  (7, 10, '温度', 1), (8, 10, '糖度', 2);

INSERT INTO `dish_spec_option` (`group_id`, `option_name`, `price_diff`, `sort`) VALUES
  (1, '小份', 0.00, 1), (1, '大份', 3.00, 2),
  (2, '不辣', 0.00, 1), (2, '微辣', 0.00, 2), (2, '中辣', 0.00, 3), (2, '特辣', 0.00, 4),
  (3, '小份', 0.00, 1), (3, '大份', 2.00, 2),
  (4, '水饺', 0.00, 1), (4, '煎饺', 3.00, 2),
  (5, '小份', 0.00, 1), (5, '大份', 6.00, 2),
  (6, '例汤', 0.00, 1), (6, '大盅', 8.00, 2),
  (7, '正常冰', 0.00, 1), (7, '少冰', 0.00, 2), (7, '去冰', 0.00, 3), (7, '常温', 0.00, 4),
  (8, '正常糖', 0.00, 1), (8, '半糖', 0.00, 2), (8, '无糖', 0.00, 3);

INSERT INTO `addon` (`id`, `addon_name`, `price`, `max_select`) VALUES
  (1,  '加蛋',         2.00, 2),
  (2,  '加牛肉 50g',   9.00, 1),
  (3,  '加宽粉',       3.00, 1),
  (4,  '加豆腐',       3.00, 1),
  (5,  '加卤蛋',       2.00, 2),
  (6,  '加米饭',       2.00, 1),
  (7,  '加一份(6只)', 11.00, 1),
  (8,  '加虾仁',       6.00, 1),
  (9,  '加煎蛋',       2.00, 1),
  (10, '加荷包蛋',     3.00, 1),
  (11, '加小料(椰果)', 2.00, 0);

INSERT INTO `dish_addon` (`dish_id`, `addon_id`, `sort`) VALUES
  (1, 3, 1), (1, 4, 2), (1, 2, 3),
  (2, 5, 1), (2, 6, 2),
  (5, 7, 1),
  (6, 1, 1), (6, 8, 2),
  (7, 9, 1), (7, 10, 2),
  (10, 11, 1);

-- ============================================================================
-- 七、常用统计查询示例（对应报表 / 桌台概览，供开发参考，可做成聚合接口或视图）
-- ============================================================================

-- 示例 1：日营收报表（日期、订单数量、总营收）
-- SELECT DATE(o.created_at) AS stat_date,
--        COUNT(*) AS order_count,
--        SUM(o.payable_amount) AS revenue
-- FROM orders o
-- WHERE o.status = 'SETTLED'
-- GROUP BY DATE(o.created_at);

-- 示例 2：菜品销量排行（时间段筛选，按成交份数；含规格文本）
-- SELECT oi.dish_name, oi.spec_text,
--        SUM(oi.qty) AS sold_qty,
--        SUM(oi.item_amount) AS sales_amount
-- FROM order_item oi
-- JOIN orders o ON o.id = oi.order_id
-- WHERE o.status = 'SETTLED'
--   AND oi.item_status = 'NORMAL'
--   AND o.created_at BETWEEN '2026-11-01' AND '2026-11-30 23:59:59'
-- GROUP BY oi.dish_id, oi.dish_name, oi.spec_text
-- ORDER BY sold_qty DESC;

-- 示例 3：退菜统计（退菜记录 + 原因分布）
-- SELECT oi.dish_name, oi.return_reason, oi.qty, oi.returned_at
-- FROM order_item oi
-- WHERE oi.item_status = 'RETURNED'
-- ORDER BY oi.returned_at DESC;

-- 示例 4：桌台实时状态（收银台概览：空闲/待结算/挂单，动态推导不落库）
-- SELECT t.id, t.table_name, a.area_name,
--   CASE
--     WHEN SUM(o.status = 'PENDING' AND o.hung_flag = 1) > 0 THEN 'HUNG'
--     WHEN SUM(o.status = 'PENDING') > 0 THEN 'OCCUPIED'
--     ELSE 'FREE'
--   END AS live_status
-- FROM dining_table t
-- JOIN dining_area a ON a.id = t.area_id
-- LEFT JOIN orders o ON o.table_id = t.id AND o.status = 'PENDING'
-- WHERE t.is_deleted = 0
-- GROUP BY t.id;

-- 示例 5：当日简易流水（收银台首页：今日订单数、营收汇总）
-- SELECT COUNT(*) AS today_orders, SUM(payable_amount) AS today_revenue
-- FROM orders
-- WHERE status = 'SETTLED' AND DATE(settled_at) = CURDATE();
