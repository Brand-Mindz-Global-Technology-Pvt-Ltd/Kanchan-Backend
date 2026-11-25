-- =============================================================================
-- KANCHAN E-COMMERCE DATABASE SCHEMA
-- Target Database: MySQL 8.0+ (InnoDB Engine)
-- Character Set: utf8mb4 | Collation: utf8mb4_unicode_ci
-- Source: Kanchan-Backend Business Architecture and TypeScript Models
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. ADMIN USERS TABLE
-- Maps to: SafeAdmin / AdminRecord (Kanchan-Backend/src/types/admin.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL,
  role VARCHAR(50) NOT NULL DEFAULT 'admin',
  password_hash VARCHAR(255) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_admins_email (email)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 2. ADMIN SESSIONS TABLE
-- Maps to: AdminSession (Kanchan-Backend/src/types/admin.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admin_sessions (
  token VARCHAR(128) NOT NULL,
  admin_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (token),
  KEY idx_admin_sessions_admin_id (admin_id),
  KEY idx_admin_sessions_expires_at (expires_at),
  CONSTRAINT fk_admin_sessions_admin
    FOREIGN KEY (admin_id) REFERENCES admins (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 3. CATEGORIES TABLE
-- Maps to: Category (Kanchan-Backend/src/types/category.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS categories (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  image VARCHAR(500) NOT NULL,
  product_count INT NOT NULL DEFAULT 0,
  status ENUM('Active', 'Inactive') NOT NULL DEFAULT 'Active',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_categories_name (name),
  KEY idx_categories_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 4. PRODUCTS TABLE
-- Maps to: Product (Kanchan-Backend/src/types/product.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS products (
  id VARCHAR(64) NOT NULL,
  name VARCHAR(200) NOT NULL,
  subtitle VARCHAR(255) NOT NULL,
  badge VARCHAR(100) NULL,
  badge_bg VARCHAR(50) NULL DEFAULT '#06452E',
  original_price VARCHAR(50) NOT NULL,
  price VARCHAR(50) NOT NULL,
  price_numeric DECIMAL(10, 2) NOT NULL,
  rating DECIMAL(3, 2) NOT NULL DEFAULT 4.50,
  image VARCHAR(500) NOT NULL,
  images JSON NULL,
  category VARCHAR(100) NOT NULL,
  category_id VARCHAR(64) NULL,
  light VARCHAR(50) NOT NULL DEFAULT 'indirect',
  stock INT NOT NULL DEFAULT 0,
  description TEXT NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_products_category (category),
  KEY idx_products_category_id (category_id),
  KEY idx_products_price_numeric (price_numeric),
  KEY idx_products_stock (stock),
  CONSTRAINT fk_products_category
    FOREIGN KEY (category_id) REFERENCES categories (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 5. CUSTOMERS TABLE
-- Maps to: SafeCustomer / CustomerRecord (Kanchan-Backend/src/types/customer.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customers (
  id VARCHAR(64) NOT NULL,
  full_name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  mobile_number VARCHAR(20) NULL,
  gender VARCHAR(20) NULL,
  address TEXT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_customers_email (email),
  KEY idx_customers_mobile (mobile_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 6. CUSTOMER SESSIONS TABLE
-- Maps to: AuthSession (Kanchan-Backend/src/types/customer.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_sessions (
  token VARCHAR(128) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at TIMESTAMP NOT NULL,
  PRIMARY KEY (token),
  KEY idx_customer_sessions_customer_id (customer_id),
  KEY idx_customer_sessions_expires_at (expires_at),
  CONSTRAINT fk_customer_sessions_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 7. CUSTOMER ADDRESSES TABLE
-- Maps to: CustomerAddress (Kanchan-Backend/src/types/address.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS customer_addresses (
  id VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  name VARCHAR(150) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  pincode VARCHAR(10) NOT NULL,
  flat_building VARCHAR(255) NOT NULL,
  street_colony VARCHAR(255) NOT NULL,
  landmark VARCHAR(255) NULL,
  tag ENUM('HOME', 'WORK') NOT NULL DEFAULT 'HOME',
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_addresses_customer_id (customer_id),
  KEY idx_addresses_pincode (pincode),
  KEY idx_addresses_is_default (is_default),
  CONSTRAINT fk_addresses_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 8. CART ITEMS TABLE
-- Maps to: CartItem (Kanchan-Backend/src/types/cart.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS cart_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  variant VARCHAR(100) NOT NULL DEFAULT '',
  pot_type VARCHAR(100) NOT NULL DEFAULT '',
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2) NULL,
  quantity INT NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_cart_customer_product_variant_pot (customer_id, product_id, variant, pot_type),
  KEY idx_cart_customer_id (customer_id),
  KEY idx_cart_product_id (product_id),
  CONSTRAINT fk_cart_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_cart_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 9. WISHLIST ITEMS TABLE
-- Maps to: WishlistItem (Kanchan-Backend/src/types/wishlist.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS wishlist_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  customer_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_wishlist_customer_product (customer_id, product_id),
  KEY idx_wishlist_customer_id (customer_id),
  KEY idx_wishlist_product_id (product_id),
  CONSTRAINT fk_wishlist_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_wishlist_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 10. ORDERS TABLE
-- Maps to: Order (Kanchan-Backend/src/types/order.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS orders (
  id VARCHAR(64) NOT NULL,
  order_number VARCHAR(64) NOT NULL,
  customer_id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  customer_email VARCHAR(191) NOT NULL,
  customer_phone VARCHAR(20) NOT NULL,
  customer_address TEXT NOT NULL,
  delivery_address_id VARCHAR(64) NULL,
  delivery_address_json JSON NULL,
  item_count INT NOT NULL DEFAULT 1,
  subtotal DECIMAL(10, 2) NOT NULL,
  total_savings DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  delivery_fee DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  free_shipping_threshold DECIMAL(10, 2) NOT NULL DEFAULT 799.00,
  total_amount DECIMAL(10, 2) NOT NULL,
  payment_method ENUM('online', 'cod') NOT NULL DEFAULT 'cod',
  payment_status ENUM('pending', 'paid', 'failed', 'refunded') NOT NULL DEFAULT 'pending',
  order_status ENUM('pending', 'processing', 'shipped', 'delivered', 'cancelled') NOT NULL DEFAULT 'pending',
  order_date DATE NOT NULL,
  stock_restored TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  UNIQUE KEY uq_orders_order_number (order_number),
  KEY idx_orders_customer_id (customer_id),
  KEY idx_orders_order_status (order_status),
  KEY idx_orders_payment_status (payment_status),
  KEY idx_orders_order_date (order_date),
  KEY idx_orders_created_at (created_at),
  KEY idx_orders_delivery_address_id (delivery_address_id),
  CONSTRAINT fk_orders_customer
    FOREIGN KEY (customer_id) REFERENCES customers (id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_orders_delivery_address
    FOREIGN KEY (delivery_address_id) REFERENCES customer_addresses (id)
    ON DELETE SET NULL ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 11. ORDER ITEMS TABLE
-- Maps to: OrderItem (Kanchan-Backend/src/types/order.types.ts)
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  order_id VARCHAR(64) NOT NULL,
  product_id VARCHAR(64) NOT NULL,
  product_name VARCHAR(200) NOT NULL,
  variant VARCHAR(100) NULL,
  pot_type VARCHAR(100) NULL,
  price DECIMAL(10, 2) NOT NULL,
  original_price DECIMAL(10, 2) NULL,
  discount_per_unit DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  quantity INT NOT NULL DEFAULT 1,
  total_price DECIMAL(10, 2) NOT NULL,
  total_savings DECIMAL(10, 2) NOT NULL DEFAULT 0.00,
  image VARCHAR(500) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_order_items_order_id (order_id),
  KEY idx_order_items_product_id (product_id),
  CONSTRAINT fk_order_items_order
    FOREIGN KEY (order_id) REFERENCES orders (id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_order_items_product
    FOREIGN KEY (product_id) REFERENCES products (id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- -----------------------------------------------------------------------------
-- 12. ENQUIRIES TABLE
-- Maps to: Enquiry (Kanchan-Frontend/src/types/admin.ts) & ContactFormSection
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS enquiries (
  id VARCHAR(64) NOT NULL,
  customer_name VARCHAR(150) NOT NULL,
  email VARCHAR(191) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  city VARCHAR(100) NULL,
  state VARCHAR(100) NULL,
  subject VARCHAR(255) NOT NULL DEFAULT 'General Enquiry',
  message TEXT NOT NULL,
  status ENUM('New', 'Read', 'Replied') NOT NULL DEFAULT 'New',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (id),
  KEY idx_enquiries_status (status),
  KEY idx_enquiries_email (email),
  KEY idx_enquiries_created_at (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

