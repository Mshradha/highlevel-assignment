import { Link, Outlet } from "react-router";
import styles from "./Layout.module.css";

export function Layout() {
  return (
    <div className={styles.shell}>
      <header className={styles.header}>
        <Link to="/contacts" className={styles.brand}>
          CRM Contact Workspace
        </Link>
      </header>
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
