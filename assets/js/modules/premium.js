/* =========================================================
   Studia-IA · modules/premium.js
   Planes Gratis / Premium (según el documento del grupo).
   Ahora mismo estamos en MODO CREADORES: el plan premium está
   activado por defecto y no se puede bajar a Gratis.
   ========================================================= */
(function (global) {
  'use strict';

  var Studia = global.Studia = global.Studia || {};
  var U = Studia.utils, store = Studia.store, ui = Studia.ui;

  var FREE = [
    'Calendario integrado con días festivos',
    'Recordatorios de tareas y exámenes',
    'Racha y recompensas básicas',
    'Línea de progresión del estudio',
    'Organización del tiempo y horario',
    'Prueba gratuita de la IA (Luna)',
    'Simulador de exámenes básico',
    'Horarios y apuntes por asignatura'
  ];

  var PREMIUM = [
    'Todo lo del plan Gratis',
    'Parte social completa: foro, chat privado y compartir',
    'IA sin límites con memoria y personalización total',
    'Enlaces directos a Word, Excel y Drive ilimitados',
    'Subida de vídeos y apuntes sin límite de tamaño',
    'Sin anuncios',
    'Creación de documentos completos',
    'Simulador de exámenes avanzado con corrección',
    'Banco de exámenes anteriores por asignatura',
    'Personalización total de tu robot de IA',
    'Planes de verano, vacaciones e idiomas',
    'Test inicial de conocimientos detallado',
    'Recomendaciones personalizadas a futuro'
  ];

  var COMPARE = [
    ['Calendario con festivos', true, true],
    ['Recordatorios', true, true],
    ['Racha y recompensas', true, true],
    ['Línea de progresión', true, true],
    ['Horario de clases', true, true],
    ['Prueba gratuita de la IA', true, true],
    ['Simular exámenes', 'básico', true],
    ['Parte social (foro y chat)', false, true],
    ['IA con memoria', 'limitada', true],
    ['Enlaces a Word / Excel', '3 por asignatura', true],
    ['Subir vídeos', false, true],
    ['Sin anuncios', false, true],
    ['Documentos completos', false, true],
    ['Exámenes anteriores', false, true],
    ['Robot IA personalizable', 'básico', true],
    ['Planes de verano / idiomas', false, true],
    ['Test inicial detallado', false, true],
    ['Cancelar en cualquier momento', false, true]
  ];

  function isPremium() { return store.get().profile.plan === 'premium'; }

  function render(root) {
    U.clear(root);
    var premium = isPremium();

    root.appendChild(U.h('div.col.gap-2', [
      U.h('div.grid.grid-2', [
        planCard('Gratis', 'free', FREE, premium ? false : true),
        planCard('Premium', 'premium', PREMIUM, premium)
      ]),
      U.h('div.card', [
        U.h('div.card__head', [
          U.h('div', [U.h('h3', 'Comparativa del modelo freemium'), U.h('p', 'Propuesta de planes; no hay pagos ni suscripciones activos.')]),
          U.h('span.badge' + (premium ? '.badge--amber' : ''), premium ? 'Estás en Premium' : 'Estás en Gratis')
        ]),
        U.h('div', { style: { overflowX: 'auto' } }, [
          U.h('table.compare', [
            U.h('thead', U.h('tr', [U.h('th', 'Función'), U.h('th', 'Gratis'), U.h('th', 'Premium')])),
            U.h('tbody', COMPARE.map(function (row) {
              return U.h('tr', [
                U.h('td', row[0]),
                U.h('td', cell(row[1])),
                U.h('td', cell(row[2]))
              ]);
            }))
          ])
        ])
      ]),
      U.h('div.card', [
        U.h('div.card__head', [U.h('h3', 'Acceso del equipo')]),
        U.h('div.row.row--between.row--wrap.gap-2', [
          U.h('div', [
            U.h('strong.small', 'Acceso completo (modo creadores)'),
            U.h('p.tiny.soft', 'Todas las funciones Premium están activadas para el equipo. Cuando llegue el sistema de pago real podrás elegir plan aquí.')
          ]),
          U.h('span.badge.badge--amber', 'Estás en Premium')
        ])
      ])
    ]));
  }

  function cell(v) {
    if (v === true) return U.h('span.yes', '✓');
    if (v === false) return U.h('span.no', '—');
    return U.h('span.small', String(v));
  }

  function planCard(name, key, features, active) {
    var premium = key === 'premium';
    return U.h('div.plan' + (active ? '.plan--active' : '') + (premium ? '.plan--premium' : ''), [
      premium ? U.h('span.plan__tag', 'Recomendado') : null,
      U.h('div', [
        U.h('h3', name),
        U.h('div.plan__price', premium ? [U.h('span', '4,99 €'), U.h('small', ' / mes · propuesta')] : [U.h('span', '0 €'), U.h('small', ' para siempre')])
      ]),
      U.h('p.small', premium ? 'Desbloquea la parte social, la IA completa y todos los extras.' : 'Todo lo esencial para organizarte y estudiar.'),
      U.h('div.plan__features', features.map(function (f) {
        return U.h('div.plan__feature', [U.icon('check'), U.h('span', f)]);
      })),
      U.h('div.spacer'),
      U.h('button.btn.btn--block' + (premium ? '.btn--amber' : '.btn--ghost'), { disabled: true }, premium ? 'Incluido en el modo creadores' : 'No incluido ahora')
    ]);
  }

  function refresh() {
    var main = document.getElementById('appMain');
    if (main && Studia.router.current() === 'premium') render(main);
  }

  function init() {
    store.subscribe(function () {
      if (Studia.router.current() === 'premium') refresh();
    });
  }

  Studia.modules = Studia.modules || {};
  Studia.modules.premium = { init: init, render: render };
  Studia.router.register('premium', {
    title: 'Premium',
    subtitle: 'Elige el plan que encaja contigo',
    render: render
  });
})(window);
