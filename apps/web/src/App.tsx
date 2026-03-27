import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { AuthProvider } from './lib/auth-context';
import { SiteProvider } from './lib/site-context';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { LoginPage } from './pages/LoginPage';
import { ProductPage } from './pages/ProductPage';
import { RegisterPage } from './pages/RegisterPage';

export default function App() {
  return (
    <SiteProvider>
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<AppShell />} path="/">
              <Route element={<HomePage />} index />
              <Route element={<CatalogPage />} path="catalog" />
              <Route element={<CatalogPage />} path="catalog/:categorySlug" />
              <Route element={<ProductPage />} path="product/:productSlug" />
              <Route element={<LoginPage />} path="login" />
              <Route element={<RegisterPage />} path="register" />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </SiteProvider>
  );
}
