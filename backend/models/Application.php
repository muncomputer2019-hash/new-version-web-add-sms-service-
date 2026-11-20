<?php
declare(strict_types=1);

namespace MunComputer\Models;

class Application extends BaseModel
{
    protected string $table = 'applications';

    public function listPaginated(int $limit, int $offset, ?string $status = null): array
    {
        $sql = "SELECT a.*, c.full_name AS customer_name, s.name AS service_name
                FROM applications a
                INNER JOIN customers c ON c.id = a.customer_id
                INNER JOIN services s ON s.id = a.service_id";
        $params = [];

        if ($status !== null && $status !== 'All') {
            $sql .= " WHERE a.status = :status";
            $params[':status'] = $status;
        }

        $sql .= " ORDER BY a.created_at DESC LIMIT :lim OFFSET :off";
        $stmt = $this->db->prepare($sql);
        foreach ($params as $key => $val) {
            $stmt->bindValue($key, $val);
        }
        $stmt->bindValue(':lim', $limit, \PDO::PARAM_INT);
        $stmt->bindValue(':off', $offset, \PDO::PARAM_INT);
        $stmt->execute();

        return $stmt->fetchAll();
    }
}
