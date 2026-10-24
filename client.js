window.__ModuleLoader__.load({
  id: '@local/dsh-desktop-notify',
  factory(require) {
    // Plain-JS Client half. This plugin renders no UI: it observes the Harness's
    // Session status and raises Windows toast notifications from the Electron
    // renderer, so the whole capability is side effects. (`require` is part of
    // the module-loader factory signature; nothing extra is imported here.)
    const TAG = '[dsh-desktop-notify]';
    // Cooldown so one event surfacing across several status rebuilds cannot
    // stack identical toasts.
    const DEDUPE_MS = 1500;

    /**
     * Build the notification title/body for one pending question batch.
     * @param {string|undefined} sessionTitle display title of the session.
     * @param {any[]} questions the pending interaction's questions.
     * @returns {{title:string, body:string}}
     */
    function questionNotice(sessionTitle, questions) {
      const first = Array.isArray(questions) && questions.length > 0 ? questions[0] : undefined;
      const head = first && (first.header || first.question) ? (first.header || first.question) : '需要你的回复';
      const more = Array.isArray(questions) && questions.length > 1 ? `（共 ${questions.length} 个问题）` : '';
      return {
        title: `${head}${more}`,
        body: sessionTitle ? `会话：${sessionTitle}` : '有提问等待你回复',
      };
    }

    /**
     * Install the notification side effects on the Client Context.
     * @param {any} ctx restricted Client Context carrying the injected services.
     */
    function install(ctx) {
      const sessions = ctx.sessions;
      const uiSession = ctx.uiSession;
      const uiWorkspace = ctx.uiWorkspace;
      if (uiSession === undefined || uiSession.sessionStatus === undefined) {
        console.warn(TAG, 'uiSession.sessionStatus unavailable; notifications disabled');
        return;
      }
      if (typeof globalThis.Notification !== 'function') {
        console.warn(TAG, 'Notification API unavailable; notifications disabled');
        return;
      }
      if (globalThis.Notification.permission === 'denied') {
        console.warn(TAG, 'notification permission denied by the runtime; notifications disabled');
        return;
      }

      /** Session display title from the controller list, when available. */
      function titleOf(sessionId) {
        try {
          const row = sessions?.list?.getSnapshot?.()?.byId?.[sessionId];
          return row !== undefined && typeof row.displayTitle === 'string' && row.displayTitle.length > 0
            ? row.displayTitle
            : undefined;
        } catch (_error) {
          return undefined;
        }
      }

      /** Per-session observed state; the first sighting baseline is silent. */
      const memory = new Map();
      /** dedupe key -> last shown timestamp. */
      const shownAt = new Map();

      /**
       * Raise one notification; a click focuses the window and opens the session.
       * @param {string} key dedupe key.
       * @param {string} title notification title.
       * @param {string} body notification body.
       * @param {string} [sessionId] conversation to open on click.
       */
      function notify(key, title, body, sessionId) {
        const at = shownAt.get(key);
        if (at !== undefined && Date.now() - at < DEDUPE_MS) return;
        shownAt.set(key, Date.now());
        let notification;
        try {
          notification = new globalThis.Notification(title, {
            body,
            requireInteraction: false,
            silent: false,
          });
        } catch (error) {
          console.error(TAG, 'failed to show notification', error);
          return;
        }
        notification.onclick = () => {
          try {
            if (typeof window !== 'undefined' && typeof window.focus === 'function') window.focus();
            if (sessionId !== undefined && uiWorkspace !== undefined && typeof uiWorkspace.openSession === 'function') {
              uiWorkspace.openSession(sessionId);
            }
          } catch (error) {
            console.error(TAG, 'failed to open session from notification', error);
          }
          try {
            notification.close();
          } catch (error) {
            void error;
          }
        };
        notification.onclose = () => {
          notification.onclick = null;
          notification.onclose = null;
        };
      }

      /**
       * Diff the Harness Session status snapshot (running flag and pending
       * interaction per session) and notify on new completions and questions.
       */
      function evaluate() {
        const status = uiSession.sessionStatus.getSnapshot();
        if (!(status instanceof Map)) return;

        const seenIds = new Set();
        for (const [id, cell] of status) {
          if (cell === undefined) continue;
          seenIds.add(id);
          const title = titleOf(id);
          const pending = cell.pendingInteraction;
          const pendingKey = pending !== undefined && typeof pending.key === 'string' ? pending.key : undefined;

          const previous = memory.get(id);
          if (previous === undefined) {
            // First sighting: never replay an old completion, but a still-pending
            // question is not stale — it still needs the user, so notify it.
            if (pendingKey !== undefined) {
              const notice = questionNotice(title, pending.questions);
              notify(`q:${id}:${pendingKey}`, notice.title, notice.body, id);
              memory.set(id, { running: cell.running === true, pendingKey });
            } else {
              memory.set(id, { running: cell.running === true, pendingKey: undefined });
            }
            continue;
          }

          if (previous.running === true && cell.running !== true) {
            notify(`done:${id}`, '任务已完成', title ? `会话：${title}` : '一轮任务已经结束', id);
          }
          if (pendingKey !== undefined && pendingKey !== previous.pendingKey) {
            const notice = questionNotice(title, pending.questions);
            notify(`q:${id}:${pendingKey}`, notice.title, notice.body, id);
          }
          previous.running = cell.running === true;
          previous.pendingKey = pendingKey;
        }

        for (const id of [...memory.keys()]) {
          if (!seenIds.has(id)) memory.delete(id);
        }
      }

      const unsubscribe = uiSession.sessionStatus.subscribe(() => {
        try {
          evaluate();
        } catch (error) {
          console.error(TAG, 'evaluate failed', error);
        }
      });
      ctx.effect(() => unsubscribe, 'dsh-desktop-notify: session status subscription');

      try {
        evaluate();
      } catch (error) {
        console.error(TAG, 'initial evaluate failed', error);
      }

      console.log(TAG, 'desktop notifications active');
    }

    return {
      inject: ['sessions', 'uiSession', 'uiWorkspace'],
      apply(ctx) {
        install(ctx);
      },
    };
  },
});
