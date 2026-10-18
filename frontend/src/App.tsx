import { Navigate, Route, Routes } from "react-router";
import { Layout } from "./components/Layout";
import { NotFoundPage } from "./components/NotFoundPage";
import { ContactDetailPage } from "./features/contacts/detail/ContactDetailPage";
import { ContactsPage } from "./features/contacts/list/ContactsPage";

// The router itself is supplied by main.tsx (BrowserRouter) or by tests (MemoryRouter).
export function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<Navigate to="/contacts" replace />} />
        <Route path="contacts" element={<ContactsPage />} />
        <Route path="contacts/:id" element={<ContactDetailPage />} />
        <Route path="*" element={<NotFoundPage />} />
      </Route>
    </Routes>
  );
}
