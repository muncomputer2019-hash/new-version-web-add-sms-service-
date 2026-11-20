<?php
declare(strict_types=1);

namespace MunComputer\Services;

use DateTimeImmutable;
use DateTimeZone;
use PDO;
use RuntimeException;
use Throwable;

/**
 * Transaction-Safe Automatic User ID Sequence Service (Phase 02 Final Master)
 *
 * Canonical Format:
 *   MC + YYFF + MM + SSSS (NO hyphen, NO space, NO separator)
 *
 * Examples (FY 2026-27, November 2026):
 *   MC2627110001
 *   MC2627110002
 *   MC2627110003
 */
class UserIdSequenceService
{
    public const SUPPORTED_ROLES = ['ADMIN', 'MANAGER', 'STAFF', 'AUDITOR', 'CUSTOMER'];

    public function __construct(
        private readonly PDO $db,
        private readonly string $companyPrefix = 'MC',
        private readonly int $serialPadding = 4
    ) {
    }

    public static function resolveFinancialYearCode(int $year, int $month): string
    {
        $startYear = $month >= 4 ? $year : $year - 1;
        return substr((string) $startYear, -2) . substr((string) ($startYear + 1), -2);
    }

    public function allocateNextUserId(
        string $roleSlug = 'STAFF',
        ?int $year = null,
        ?int $month = null,
        ?int $actorUserId = null,
        ?string $departmentCode = null
    ): string {
        $normalizedRole = strtoupper(trim($roleSlug));
        if (!in_array($normalizedRole, self::SUPPORTED_ROLES, true)) {
            throw new RuntimeException("Unsupported role for User ID generation: {$roleSlug}");
        }

        $nowIst = new DateTimeImmutable('now', new DateTimeZone('Asia/Kolkata'));
        $targetYear = $year ?? (int) $nowIst->format('Y');
        $targetMonth = $month ?? (int) $nowIst->format('n');
        $fyCode = self::resolveFinancialYearCode($targetYear, $targetMonth);
        $monthCode = str_pad((string) $targetMonth, 2, '0', STR_PAD_LEFT);
        $roleCode = match ($normalizedRole) {
            'ADMIN' => 'AD',
            'MANAGER' => 'MN',
            'STAFF' => 'ST',
            'AUDITOR' => 'AU',
            default => 'CU',
        };

        $startedTransaction = !$this->db->inTransaction();
        if ($startedTransaction) {
            $this->db->beginTransaction();
        }

        try {
            // Lock sequence row inside DB transaction to prevent concurrent duplicates
            $stmt = $this->db->prepare(
                "SELECT id, last_serial FROM user_id_sequences
                 WHERE fy_code = :fy AND month_code = :mm
                 FOR UPDATE"
            );
            $stmt->execute([
                ':fy' => $fyCode,
                ':mm' => $monthCode,
            ]);
            $row = $stmt->fetch();

            if (!$row) {
                $nextSerial = 1;
                $insert = $this->db->prepare(
                    "INSERT INTO user_id_sequences (role_code, fy_code, month_code, sequence_year, fixed_code, last_serial, status)
                     VALUES (:rc, :fy, :mm, :yr, :fc, :serial, 'active')"
                );
                $insert->execute([
                    ':rc' => $roleCode,
                    ':fy' => $fyCode,
                    ':mm' => $monthCode,
                    ':yr' => $targetYear,
                    ':fc' => $fyCode . $monthCode,
                    ':serial' => $nextSerial,
                ]);
            } else {
                $nextSerial = ((int) $row['last_serial']) + 1;
                $update = $this->db->prepare(
                    "UPDATE user_id_sequences SET last_serial = :serial WHERE id = :id"
                );
                $update->execute([
                    ':serial' => $nextSerial,
                    ':id' => $row['id'],
                ]);
            }

            $generatedId = sprintf(
                '%s%s%s%0' . $this->serialPadding . 'd',
                $this->companyPrefix,
                $fyCode,
                $monthCode,
                $nextSerial
            );

            $histStmt = $this->db->prepare(
                "INSERT INTO user_id_generation_history
                 (generated_user_code, role_slug, fy_code, month_code, serial_no, generated_by_user_id, department_code, is_immutable, status)
                 VALUES (:code, :role, :fy, :mm, :serial, :actor, :dept, 1, 'active')"
            );
            $histStmt->execute([
                ':code' => $generatedId,
                ':role' => $normalizedRole,
                ':fy' => $fyCode,
                ':mm' => $monthCode,
                ':serial' => $nextSerial,
                ':actor' => $actorUserId,
                ':dept' => $departmentCode,
            ]);

            if ($startedTransaction) {
                $this->db->commit();
            }

            return $generatedId;
        } catch (Throwable $e) {
            if ($startedTransaction && $this->db->inTransaction()) {
                $this->db->rollBack();
            }
            throw $e;
        }
    }
}
