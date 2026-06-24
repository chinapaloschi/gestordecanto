import React from 'react';
import { useAmountsHidden } from '../context/PrivacyContext.jsx';

// Envolvé cualquier monto de dinero con esto para que se oculte cuando
// la profesora activa el "ojito" de privacidad (mostrando la pantalla a alumnos).
export function MaskedAmount({ children, placeholder = '••••••' }) {
  const { amountsHidden } = useAmountsHidden();
  return amountsHidden ? <span aria-hidden="true">{placeholder}</span> : <>{children}</>;
}
