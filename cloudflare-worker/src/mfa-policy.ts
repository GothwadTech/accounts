/** Shared SQL assurance check. Arguments are internal SQL column names, never request input. */
export function mfaSessionSql(userColumn: string, sessionColumn: string): string {
  return `(NOT EXISTS (SELECT 1 FROM auth_mfa_factors mf WHERE mf.user_id = ${userColumn} AND mf.enabled = 1)
    OR EXISTS (SELECT 1 FROM auth_mfa_sessions ms JOIN auth_mfa_factors mf ON mf.user_id = ms.user_id
      WHERE ms.user_id = ${userColumn} AND ms.session_id = ${sessionColumn}
        AND mf.enabled = 1 AND ms.factor_version = mf.version))`;
}
