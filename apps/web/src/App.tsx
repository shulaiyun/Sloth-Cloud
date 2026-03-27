import { BrowserRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/AppShell';
import { SiteProvider } from './lib/site-context';
import { CatalogPage } from './pages/CatalogPage';
import { HomePage } from './pages/HomePage';
import { ProductPage } from './pages/ProductPage';
import { ServicePage } from './pages/ServicePage';

export default function App() {
  return (
    <SiteProvider>
      <BrowserRouter>
        <Routes>
          <Route element={<AppShell />} path="/">
            <Route element={<HomePage />} index />
            <Route element={<CatalogPage />} path="catalog" />
            <Route element={<CatalogPage />} path="catalog/:categorySlug" />
            <Route element={<ProductPage />} path="product/:productSlug" />
            <Route element={<ServicePage />} path="services/:serviceId" />
          </Route>
        </Routes>
      </BrowserRouter>
    </SiteProvider>
  );
}
