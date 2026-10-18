import type { Activity } from "../../../api/types";
import { Button } from "../../../components/Button";
import { EmptyState, ErrorState, LoadingState } from "../../../components/StateViews";
import type { ApiRequest } from "../../../hooks/useApiRequest";
import { formatDateTime } from "../../../utils/format";
import { describeActivity } from "./activityText";
import styles from "./ContactDetailPage.module.css";

export function ActivityTimeline({ request }: { request: ApiRequest<Activity[]> }) {
  const { status, data, error, refetch, isRefreshing } = request;

  let body;
  if (status === "error" && !data) {
    body = <ErrorState title="Couldn't load activity" error={error} onRetry={refetch} />;
  } else if (!data) {
    body = <LoadingState label="Loading activity…" />;
  } else if (data.length === 0) {
    body = <EmptyState title="No activity yet">Edits and tag changes will appear here.</EmptyState>;
  } else {
    body = (
      <ol className={styles.timeline} aria-busy={isRefreshing || undefined}>
        {data.map((activity) => {
          const { title, lines } = describeActivity(activity);
          return (
            <li key={activity.id}>
              <span className={styles.timelineTitle}>{title}</span>
              <time className={styles.muted} dateTime={activity.createdAt}>
                {formatDateTime(activity.createdAt)}
              </time>
              {lines.length > 0 && (
                <ul className={styles.changeList}>
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
            </li>
          );
        })}
      </ol>
    );
  }

  return (
    <section className={styles.card} aria-labelledby="activity-heading">
      <div className={styles.cardHeader}>
        <h2 id="activity-heading">Recent activity</h2>
        <Button onClick={refetch} busy={isRefreshing} busyLabel="Refreshing…">
          Refresh
        </Button>
      </div>
      {status === "error" && data && (
        <p className={styles.formError} role="alert">
          Couldn't refresh the activity. Showing what was loaded before.
        </p>
      )}
      {body}
    </section>
  );
}
