import { Link, useParams } from "react-router";

// Placeholder route target; the detail view is built in Phase 10.
export function ContactDetailPage() {
  const { id } = useParams();
  return (
    <section>
      <p>
        <Link to="/contacts">← Contacts</Link>
      </p>
      <h1>Contact {id}</h1>
    </section>
  );
}
