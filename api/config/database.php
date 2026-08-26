<?php
/**
 * 数据库连接配置
 * 
 * 支持PostgreSQL和MySQL
 */

class Database {
    private $host;
    private $port;
    private $db_name;
    private $username;
    private $password;
    private $conn;
    private $db_type;

    public function __construct() {
        // 检查环境变量是否存在
        if (getenv('PGHOST') && getenv('PGPORT') && getenv('PGDATABASE') && getenv('PGUSER') && getenv('PGPASSWORD')) {
            // PostgreSQL连接 (Replit环境)
            $this->host = getenv('PGHOST');
            $this->port = getenv('PGPORT');
            $this->db_name = getenv('PGDATABASE');
            $this->username = getenv('PGUSER');
            $this->password = getenv('PGPASSWORD');
            $this->db_type = 'pgsql';
        } else {
            // MySQL连接 (本地和生产环境)
            $this->host = getenv('DB_HOST') ?: 'localhost';
            $this->port = getenv('DB_PORT') ?: '3306';
            $this->db_name = getenv('DB_NAME') ?: 'oasystem';
            $this->username = getenv('DB_USER') ?: 'root';
            $this->password = getenv('DB_PASSWORD') ?: '';
            $this->db_type = 'mysql';
        }
    }

    // 获取数据库连接
    public function getConnection() {
        $this->conn = null;

        try {
            if ($this->db_type === 'pgsql') {
                // PostgreSQL连接
                $dsn = "pgsql:host={$this->host};port={$this->port};dbname={$this->db_name}";
                $this->conn = new PDO($dsn, $this->username, $this->password);
            } else {
                // MySQL连接
                $dsn = "mysql:host={$this->host};port={$this->port};dbname={$this->db_name}";
                $this->conn = new PDO($dsn, $this->username, $this->password);
                $this->conn->exec("set names utf8mb4");
            }
            
            $this->conn->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
            $this->conn->setAttribute(PDO::ATTR_DEFAULT_FETCH_MODE, PDO::FETCH_ASSOC);
            $this->conn->setAttribute(PDO::ATTR_EMULATE_PREPARES, false);
        } catch (PDOException $e) {
            echo "数据库连接失败: " . $e->getMessage();
        }

        return $this->conn;
    }

    // 获取数据库类型
    public function getDbType() {
        return $this->db_type;
    }
}