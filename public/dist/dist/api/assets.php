<?php
/**
 * 资产数据API端点
 * 从数据库获取资产数据
 */

// 设置内容类型为JSON
header('Content-Type: application/json');

// 允许跨域请求
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Origin, Content-Type, X-Auth-Token, Authorization, X-Requested-With');

// 如果是预检请求，直接返回
if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// 连接数据库
$db_connection = null;
try {
    // 从环境变量获取数据库连接信息
    $db_host = getenv('PGHOST');
    $db_port = getenv('PGPORT');
    $db_name = getenv('PGDATABASE');
    $db_user = getenv('PGUSER');
    $db_password = getenv('PGPASSWORD');
    
    // 创建数据库连接
    $db_connection = pg_connect("host=$db_host port=$db_port dbname=$db_name user=$db_user password=$db_password");
    
    if (!$db_connection) {
        throw new Exception("无法连接到数据库");
    }
    
    // 获取项目ID（如果提供）
    $project_id = isset($_GET['projectId']) ? intval($_GET['projectId']) : 1;
    
    // 查询assets表获取资产数据
    $query = "
        SELECT 
            a.id, 
            a.name, 
            a.type, 
            a.quantity, 
            a.unit_price, 
            a.total_price,
            a.remaining_value,
            a.currency_type,
            a.department as department,
            a.description,
            a.status,
            a.submitter_id,
            a.approver_id,
            a.submitted_at,
            a.approved_at,
            a.created_at,
            a.updated_at
        FROM 
            assets a
        ORDER BY 
            a.created_at DESC
    ";
    
    $result = pg_query($db_connection, $query);
    
    if (!$result) {
        throw new Exception("查询数据库出错: " . pg_last_error($db_connection));
    }
    
    // 获取结果行数
    $num_rows = pg_num_rows($result);
    
    // 获取结果集
    $assets = array();
    while ($row = pg_fetch_assoc($result)) {
        $assets[] = $row;
    }
    
    // 返回标准格式的资产数据
    $response = array(
        'success' => true,
        'data' => array(
            'assets' => $assets,
            'total' => $num_rows
        )
    );
    
    // 输出JSON数据
    echo json_encode($response);
    
} catch (Exception $e) {
    // 返回错误信息
    $response = array(
        'success' => false,
        'error' => $e->getMessage()
    );
    echo json_encode($response);
} finally {
    // 关闭数据库连接
    if ($db_connection) {
        pg_close($db_connection);
    }
}
?>