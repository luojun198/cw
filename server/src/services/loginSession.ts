import type Database from 'better-sqlite3'
import { isSameLoginIp, toDisplayIp } from '../utils/requestIp.js'

export type ActiveLoginSession = {
  id: string
  login_ip: string | null
  login_at: string
  last_seen_at: string
}

export function expireStaleLoginSessions(
  db: Database.Database,
  userId: string,
  accountSetId: string
) {
  db.prepare(
    `UPDATE user_login_sessions
     SET status = 'expired'
     WHERE user_id = ? AND account_set_id = ? AND status = 'active' AND login_at <= datetime('now', '-8 hours')`
  ).run(userId, accountSetId)
}

export function listActiveLoginSessions(
  db: Database.Database,
  userId: string,
  accountSetId: string,
  excludeSessionId?: string
): ActiveLoginSession[] {
  if (excludeSessionId) {
    return db
      .prepare(
        `SELECT id, login_ip, login_at, last_seen_at
         FROM user_login_sessions
         WHERE user_id = ? AND account_set_id = ? AND status = 'active' AND id <> ?
         ORDER BY last_seen_at DESC, login_at DESC`
      )
      .all(userId, accountSetId, excludeSessionId) as ActiveLoginSession[]
  }

  return db
    .prepare(
      `SELECT id, login_ip, login_at, last_seen_at
       FROM user_login_sessions
       WHERE user_id = ? AND account_set_id = ? AND status = 'active'
       ORDER BY last_seen_at DESC, login_at DESC`
    )
    .all(userId, accountSetId) as ActiveLoginSession[]
}

export function findOtherIpActiveSession(
  sessions: ActiveLoginSession[],
  currentLoginIp: string
): ActiveLoginSession | undefined {
  return sessions.find(session => !isSameLoginIp(session.login_ip, currentLoginIp))
}

/** 本机同 IP 多开：静默过期旧会话，无需强制登录提示 */
export function expireSameIpActiveSessions(
  db: Database.Database,
  sessions: ActiveLoginSession[],
  currentLoginIp: string
) {
  const stmt = db.prepare(
    `UPDATE user_login_sessions
     SET status = 'expired', last_seen_at = datetime('now')
     WHERE id = ? AND status = 'active'`
  )
  for (const session of sessions) {
    if (isSameLoginIp(session.login_ip, currentLoginIp)) {
      stmt.run(session.id)
    }
  }
}

export function forceOtherIpActiveSessions(
  db: Database.Database,
  sessions: ActiveLoginSession[],
  currentLoginIp: string,
  forcedByIp: string
): string | null {
  const others = sessions.filter(session => !isSameLoginIp(session.login_ip, currentLoginIp))
  if (others.length === 0) return null

  const stmt = db.prepare(
    `UPDATE user_login_sessions
     SET status = 'forced', forced_logout_at = datetime('now'), forced_by_ip = ?
     WHERE id = ? AND status = 'active'`
  )
  for (const session of others) {
    stmt.run(forcedByIp, session.id)
  }

  return others[0].login_ip ? toDisplayIp(others[0].login_ip) : null
}
