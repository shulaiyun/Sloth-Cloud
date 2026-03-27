import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { AuthProvider } from './lib/auth-context';
import { SiteProvider } from './lib/site-context';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { HomePage } from './pages/HomePage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { ProductPage } from './pages/ProductPage';
import { RegisterPage } from './pages/RegisterPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { ServicesPage } from './pages/ServicesPage';

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
              <Route element={<CheckoutPage />} path="checkout" />
              <Route element={<ServicesPage />} path="services" />
              <Route element={<ServiceDetailPage />} path="services/:serviceId" />
              <Route element={<InvoicesPage />} path="invoices" />
              <Route element={<InvoiceDetailPage />} path="invoices/:invoiceId" />
              <Route element={<LoginPage />} path="login" />
              <Route element={<RegisterPage />} path="register" />
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </SiteProvider>
  );
}
