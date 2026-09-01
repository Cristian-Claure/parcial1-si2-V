import {
  ShellNavItem
} from './authenticated-shell/authenticated-shell';

export const CUSTOMER_NAV_ITEMS: ShellNavItem[] = [
  {
    label: 'Inicio',
    route: '/'
  },
  {
    label: 'Explorar productos',
    route: '/catalogo'
  },
  {
    label: 'Mi cuenta',
    route: '/mi-cuenta'
  },
  {
    label: 'Bolsa',
    route: '/bolsa'
  },
  {
    label: 'Mis pedidos',
    route: '/mis-pedidos'
  },
  {
    label: 'Favoritos',
    route: '/favoritos'
  },
  {
    label: 'Probador virtual',
    disabled: true
  }
];