import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { AuthProvider } from './lib/auth-context';
import { SiteProvider } from './lib/site-context';
import { AffiliatePage } from './pages/AffiliatePage';
import { CatalogPage } from './pages/CatalogPage';
import { CheckoutPage } from './pages/CheckoutPage';
import { CustomerPreviewPage } from './pages/CustomerPreviewPage';
import { HomePage } from './pages/HomePage';
import { InvoiceDetailPage } from './pages/InvoiceDetailPage';
import { InvoicesPage } from './pages/InvoicesPage';
import { LoginPage } from './pages/LoginPage';
import { OperatorCapsulePage } from './pages/OperatorCapsulePage';
import { OperatorHubPage } from './pages/OperatorHubPage';
import { OperatorV3Page } from './pages/OperatorV3Page';
import { OperatorV4Page } from './pages/OperatorV4Page';
import { ProductPage } from './pages/ProductPage';
import { RegisterPage } from './pages/RegisterPage';
import { ServiceDetailPage } from './pages/ServiceDetailPage';
import { ServicesPage } from './pages/ServicesPage';
import { NotFoundPage } from './pages/NotFoundPage';

function resolveBrowserBasename() {
  const baseUrl = import.meta.env.BASE_URL;
  if (!baseUrl || baseUrl === '/') {
    return undefined;
  }
  return baseUrl.replace(/\/$/, '');
}

export default function App() {
  const staticCustomerPreview = import.meta.env.VITE_STATIC_CUSTOMER_PREVIEW === 'true';

  return (
    <SiteProvider>
      <AuthProvider>
        <BrowserRouter basename={resolveBrowserBasename()}>
          <Routes>
            <Route element={<AppShell />} path="/">
              {staticCustomerPreview ? (
                <>
                  <Route element={<CustomerPreviewPage />} index />
                  <Route element={<CustomerPreviewPage />} path="preview/customer" />
                  <Route element={<Navigate replace to="/preview/customer" />} path="*" />
                </>
              ) : (
                <>
                  <Route element={<HomePage />} index />
                  <Route element={<Navigate replace to="/operator-lab" />} path="operator" />
                  <Route element={<OperatorCapsulePage />} path="operator/:capsuleId" />
                  <Route element={<OperatorV4Page />} path="operator-lab" />
                  <Route element={<OperatorV4Page />} path="operator-lab/:capsuleId" />
                  <Route element={<OperatorHubPage />} path="operator/debug" />
                  <Route element={<OperatorHubPage />} path="operator/debug/:capsuleId" />
                  <Route element={<OperatorV3Page />} path="operator/debug/v3" />
                  <Route element={<OperatorV3Page />} path="operator/debug/v3/:capsuleId" />
                  <Route element={<OperatorCapsulePage />} path="workspaces/:capsuleId" />
                  <Route element={<OperatorCapsulePage />} path="capsules/:capsuleId" />
                  <Route element={<CatalogPage />} path="catalog" />
                  <Route element={<CatalogPage />} path="catalog/:categorySlug" />
                  <Route element={<ProductPage />} path="product/:productSlug" />
                  <Route element={<CheckoutPage />} path="checkout" />
                  <Route element={<ServicesPage />} path="services" />
                  <Route element={<ServiceDetailPage />} path="services/:serviceId" />
                  <Route element={<AffiliatePage />} path="affiliate" />
                  <Route element={<InvoicesPage />} path="invoices" />
                  <Route element={<InvoiceDetailPage />} path="invoices/:invoiceId" />
                  <Route element={<LoginPage />} path="login" />
                  <Route element={<RegisterPage />} path="register" />
                  <Route element={<NotFoundPage />} path="*" />
                </>
              )}
            </Route>
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </SiteProvider>
  );
}
