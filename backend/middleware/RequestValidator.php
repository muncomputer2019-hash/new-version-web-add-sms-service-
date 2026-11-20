<?php
declare(strict_types=1);

namespace MunComputer\Middleware;

class RequestValidator
{
    public static function validate(array $input, array $rules): array
    {
        $errors = [];

        foreach ($rules as $field => $fieldRules) {
            $value = $input[$field] ?? null;
            foreach ($fieldRules as $rule) {
                if ($rule === 'required' && ($value === null || trim((string) $value) === '')) {
                    $errors[$field][] = "The {$field} field is required.";
                } elseif ($rule === 'email' && $value && !filter_var($value, FILTER_VALIDATE_EMAIL)) {
                    $errors[$field][] = "The {$field} must be a valid email address.";
                } elseif ($rule === 'numeric' && $value !== null && !is_numeric($value)) {
                    $errors[$field][] = "The {$field} must be numeric.";
                }
            }
        }

        return $errors;
    }
}
