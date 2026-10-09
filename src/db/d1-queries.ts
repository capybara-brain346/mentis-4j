export const upsertGoogleUser = String.raw`
          INSERT INTO users
            (id, google_sub, display_name, email, email_verified, avatar_url,
             status, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)
          ON CONFLICT(google_sub) DO UPDATE SET
            display_name = excluded.display_name,
            email = excluded.email,
            email_verified = excluded.email_verified,
            avatar_url = excluded.avatar_url,
            updated_at = excluded.updated_at
        `;

export const createWorkspaceForGoogleUser = String.raw`
          INSERT INTO workspaces
            (id, owner_user_id, name, status, created_at, updated_at)
          SELECT ?, id, 'Private workspace', 'active', ?, ?
          FROM users
          WHERE google_sub = ?
          ON CONFLICT(owner_user_id) DO NOTHING
        `;

export const selectGoogleAccount = String.raw`
          SELECT
            u.id AS userId,
            u.google_sub AS googleSub,
            u.display_name AS displayName,
            u.email AS email,
            u.email_verified AS emailVerified,
            u.avatar_url AS avatarUrl,
            u.status AS userStatus,
            u.created_at AS userCreatedAt,
            u.updated_at AS userUpdatedAt,
            w.id AS workspaceId,
            w.owner_user_id AS ownerUserId,
            w.name AS name,
            w.status AS workspaceStatus,
            w.created_at AS workspaceCreatedAt,
            w.updated_at AS workspaceUpdatedAt
          FROM users u
          JOIN workspaces w ON w.owner_user_id = u.id
          WHERE u.google_sub = ?
        `;

export const deleteExpiredBrowserSignIns = String.raw`DELETE FROM auth_transactions WHERE transaction_type = 'browser-sign-in' AND expires_at <= ?`;

export const createBrowserSignIn = String.raw`
        INSERT INTO auth_transactions
          (id, transaction_type, state_hash, nonce, validated_request, expires_at)
        VALUES (?, 'browser-sign-in', ?, ?, ?, ?)
      `;

export const consumeBrowserSignIn = String.raw`
      UPDATE auth_transactions SET consumed_at = ?
      WHERE state_hash = ? AND transaction_type = 'browser-sign-in'
        AND consumed_at IS NULL AND expires_at > ?
      RETURNING nonce, validated_request AS verifier
    `;

export const createBrowserSession = String.raw`
          INSERT INTO sessions (id, secret_hash, user_id, expires_at, revoked_at, created_at)
          SELECT ?, ?, id, ?, NULL, ?
          FROM users
          WHERE id = ?
            AND status = 'active'
            AND EXISTS (
              SELECT 1 FROM workspaces
              WHERE owner_user_id = users.id AND status = 'active'
            )
          RETURNING id
        `;

export const getBrowserSession = String.raw`
          SELECT
            s.id AS id,
            u.id AS userId,
            w.id AS workspaceId,
            w.name AS workspaceName,
            u.display_name AS displayName,
            u.email AS email,
            s.expires_at AS expiresAt,
            s.created_at AS createdAt
          FROM sessions s
          JOIN users u ON u.id = s.user_id
          JOIN workspaces w ON w.owner_user_id = u.id
          WHERE s.secret_hash = ?
            AND s.revoked_at IS NULL
            AND s.expires_at > ?
            AND u.status = 'active'
            AND w.status = 'active'
        `;

export const revokeBrowserSession = String.raw`
        UPDATE sessions
        SET revoked_at = ?
        WHERE secret_hash = ? AND revoked_at IS NULL
      `;

export const createConsent = String.raw`
          INSERT INTO oauth_consents
            (id, user_id, client_id, workspace_id, resource, scope,
             consent_version, expires_at, revoked_at, created_at)
          SELECT ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?
          WHERE EXISTS (
            SELECT 1
            FROM users u
            JOIN workspaces w ON w.owner_user_id = u.id
            WHERE w.id = ?
              AND u.id = ?
              AND u.status = 'active'
              AND w.status = 'active'
          )
          RETURNING id
        `;

export const getActiveOAuthAccess = String.raw`
          SELECT u.id AS userId, w.id AS workspaceId, c.id AS consentId
          FROM users u
          JOIN workspaces w ON w.owner_user_id = u.id
          JOIN oauth_consents c ON c.user_id = u.id AND c.workspace_id = w.id
          WHERE u.id = ?
            AND w.id = ?
            AND c.id = ?
            AND c.client_id = ?
            AND c.resource = ?
            AND c.scope = ?
            AND u.status = 'active'
            AND w.status = 'active'
            AND c.revoked_at IS NULL
            AND c.expires_at > ?
        `;

export const setConsentExpiry = String.raw`
        UPDATE oauth_consents
        SET expires_at = ?
        WHERE id = ? AND revoked_at IS NULL
      `;

export const getConsentForUser = String.raw`
          SELECT id, client_id AS clientId, resource, scope,
                 expires_at AS expiresAt, created_at AS createdAt
          FROM oauth_consents
          WHERE id = ? AND user_id = ? AND revoked_at IS NULL
        `;

export const listActiveConsents = String.raw`
          SELECT id, client_id AS clientId, resource, scope,
                 expires_at AS expiresAt, created_at AS createdAt
          FROM oauth_consents
          WHERE user_id = ?
            AND revoked_at IS NULL
            AND expires_at > ?
          ORDER BY created_at DESC
        `;

export const revokeConsent = String.raw`
        UPDATE oauth_consents
        SET revoked_at = ?
        WHERE user_id = ? AND id = ? AND revoked_at IS NULL
      `;

export const revokeClientConsents = String.raw`
        UPDATE oauth_consents
        SET revoked_at = ?
        WHERE user_id = ? AND client_id = ? AND revoked_at IS NULL
      `;
