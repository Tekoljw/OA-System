<?php
/**
 * 遗留文件 — 已废弃，请使用 /api/currency-types 端点（统一走 index.php 认证）
 */
header('Content-Type: application/json');
http_response_code(403);
echo json_encode(['success' => false, 'error' => '此端点已废弃，请使用 /api/currency-types']);
exit();

// ===== 以下为旧代码，已禁用 =====
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Methods: GET, POST, PUT, DELETE, OPTIONS');
header('Access-Control-Allow-Headers: Content-Type, Authorization, X-Requested-With');

if ($_SERVER['REQUEST_METHOD'] === 'OPTIONS') {
    exit(0);
}

// 数据库连接配置
$host = $_ENV['PGHOST'] ?? 'localhost';
$port = $_ENV['PGPORT'] ?? '5432';
$dbname = $_ENV['PGDATABASE'] ?? 'postgres';
$user = $_ENV['PGUSER'] ?? 'postgres';
$password = $_ENV['PGPASSWORD'] ?? '';

try {
    $pdo = new PDO("pgsql:host=$host;port=$port;dbname=$dbname", $user, $password);
    $pdo->setAttribute(PDO::ATTR_ERRMODE, PDO::ERRMODE_EXCEPTION);
} catch (PDOException $e) {
    http_response_code(500);
    echo json_encode(['success' => false, 'error' => '数据库连接失败: ' . $e->getMessage()]);
    exit;
}

$method = $_SERVER['REQUEST_METHOD'];
$projectId = $_GET['projectId'] ?? 1;

switch ($method) {
    case 'GET':
        // 获取币种列表
        try {
            $stmt = $pdo->prepare("
                SELECT id, name, code, symbol, description, active, created_at, updated_at 
                FROM currency_types 
                WHERE project_id = ? AND active = true 
                ORDER BY created_at DESC
            ");
            $stmt->execute([$projectId]);
            $currencies = $stmt->fetchAll(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'data' => $currencies
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => '获取币种列表失败: ' . $e->getMessage()]);
        }
        break;
        
    case 'POST':
        // 创建新币种
        $input = json_decode(file_get_contents('php://input'), true);
        
        if (!$input || !isset($input['name']) || !isset($input['code'])) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => '币种名称和代码不能为空']);
            break;
        }
        
        try {
            // 检查币种代码是否已存在
            $stmt = $pdo->prepare("SELECT id FROM currency_types WHERE code = ? AND project_id = ? AND active = true");
            $stmt->execute([$input['code'], $projectId]);
            if ($stmt->fetch()) {
                http_response_code(409);
                echo json_encode(['success' => false, 'error' => '币种代码已存在']);
                break;
            }
            
            // 插入新币种
            $stmt = $pdo->prepare("
                INSERT INTO currency_types (name, code, symbol, description, project_id, active, created_at, updated_at) 
                VALUES (?, ?, ?, ?, ?, true, NOW(), NOW()) 
                RETURNING id, name, code, symbol, description, active, created_at, updated_at
            ");
            
            $symbol = $input['symbol'] ?? $input['code'];
            $description = $input['description'] ?? '';
            
            $stmt->execute([
                $input['name'],
                $input['code'],
                $symbol,
                $description,
                $projectId
            ]);
            
            $newCurrency = $stmt->fetch(PDO::FETCH_ASSOC);
            
            echo json_encode([
                'success' => true,
                'data' => $newCurrency,
                'message' => '币种创建成功'
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => '创建币种失败: ' . $e->getMessage()]);
        }
        break;
        
    case 'PUT':
        // 更新币种
        $pathInfo = $_SERVER['PATH_INFO'] ?? '';
        $segments = explode('/', trim($pathInfo, '/'));
        $currencyId = end($segments);
        
        if (!$currencyId || !is_numeric($currencyId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => '无效的币种ID']);
            break;
        }
        
        $input = json_decode(file_get_contents('php://input'), true);
        
        try {
            $updateFields = [];
            $params = [];
            
            if (isset($input['name'])) {
                $updateFields[] = 'name = ?';
                $params[] = $input['name'];
            }
            
            if (isset($input['code'])) {
                $updateFields[] = 'code = ?';
                $params[] = $input['code'];
            }
            
            if (isset($input['symbol'])) {
                $updateFields[] = 'symbol = ?';
                $params[] = $input['symbol'];
            }
            
            if (isset($input['description'])) {
                $updateFields[] = 'description = ?';
                $params[] = $input['description'];
            }
            
            if (empty($updateFields)) {
                http_response_code(400);
                echo json_encode(['success' => false, 'error' => '没有提供要更新的字段']);
                break;
            }
            
            $updateFields[] = 'updated_at = NOW()';
            $params[] = $currencyId;
            $params[] = $projectId;
            
            $sql = "UPDATE currency_types SET " . implode(', ', $updateFields) . 
                   " WHERE id = ? AND project_id = ? AND active = true " .
                   " RETURNING id, name, code, symbol, description, active, created_at, updated_at";
            
            $stmt = $pdo->prepare($sql);
            $stmt->execute($params);
            
            $updatedCurrency = $stmt->fetch(PDO::FETCH_ASSOC);
            
            if (!$updatedCurrency) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => '币种不存在']);
                break;
            }
            
            echo json_encode([
                'success' => true,
                'data' => $updatedCurrency,
                'message' => '币种更新成功'
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => '更新币种失败: ' . $e->getMessage()]);
        }
        break;
        
    case 'DELETE':
        // 删除币种（软删除）
        $pathInfo = $_SERVER['PATH_INFO'] ?? '';
        $segments = explode('/', trim($pathInfo, '/'));
        $currencyId = end($segments);
        
        if (!$currencyId || !is_numeric($currencyId)) {
            http_response_code(400);
            echo json_encode(['success' => false, 'error' => '无效的币种ID']);
            break;
        }
        
        try {
            $stmt = $pdo->prepare("
                UPDATE currency_types 
                SET active = false, updated_at = NOW() 
                WHERE id = ? AND project_id = ? AND active = true
            ");
            $stmt->execute([$currencyId, $projectId]);
            
            if ($stmt->rowCount() === 0) {
                http_response_code(404);
                echo json_encode(['success' => false, 'error' => '币种不存在']);
                break;
            }
            
            echo json_encode([
                'success' => true,
                'message' => '币种删除成功'
            ]);
        } catch (PDOException $e) {
            http_response_code(500);
            echo json_encode(['success' => false, 'error' => '删除币种失败: ' . $e->getMessage()]);
        }
        break;
        
    default:
        http_response_code(405);
        echo json_encode(['success' => false, 'error' => '不支持的请求方法']);
        break;
}
?>