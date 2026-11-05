/**
 * Textos do jogo num lugar só (pt-BR é a língua do projeto).
 * Manter copy fora dos componentes facilita trocar tom e, se um dia
 * o site precisar de EN, é só clonar este objeto.
 */
export const STR = {
  title: 'ESCAPE HOUSE',
  tagline: 'ela ouve tudo. você não tem arma.',
  menu: {
    play: 'começar a noite',
    continue: 'continuar run',
    options: 'opções',
    controls: 'controles',
    credits: 'créditos',
    abandon: 'abandonar run',
  },
  controls: [
    ['WASD / setas', 'mover'],
    ['mouse', 'olhar'],
    ['Shift', 'correr (faz BARULHO)'],
    ['Ctrl ou C', 'agachar (silencioso)'],
    ['E', 'interagir / procurar / abrir porta'],
    ['L', 'lanterna'],
    ['Tab', 'inventário'],
    ['Esc ou P', 'pausa'],
    ['`', 'debug'],
  ],
  objective: (done, total) => `preparar a fuga — ${done}/${total}`,
  prompt: {
    open: 'abrir',
    close: 'fechar',
    take: 'pegar',
    search: 'procurar',
    hide: 'esconder',
    unhide: 'sair',
    examine: 'examinar',
    locked: 'trancada',
  },
  caught: {
    title: 'ELA TE PEGOU',
    body: 'você acorda de novo no mesmo quarto.',
    retry: 'tentar de novo',
    remaining: (n) => (n === 1 ? '1 tentativa restante' : `${n} tentativas restantes`),
  },
  win: {
    title: 'VOCÊ SAIU',
    body: 'a porta bate atrás de você. silêncio.',
    again: 'jogar de novo',
    time: (s) => `tempo na casa: ${Math.floor(s / 60)}m ${String(Math.floor(s % 60)).padStart(2, '0')}s`,
  },
  lose: {
    title: 'FICOU PARA SEMPRE',
    body: 'sem tentativas. a casa ganhou.',
    restart: 'recomeçar',
  },
  status: {
    spotted: 'ELA VIU VOCÊ',
    heard: 'ELA OUVIU ALGO',
    hidden: 'escondido',
    lantern: 'lanterna',
    crouch: 'agachado',
    sprint: 'correndo',
  },
  loading: ['acordando…', 'montando a casa…', 'escondendo as coisas…', 'apagando as luzes…'],
  noWebGL: {
    toast: 'sem WebGL — modo 2D (planta baixa)',
    hint: 'WebGL não respondeu. O jogo seguiu em modo 2D; para tentar o 3D, recarregue em outro navegador.',
  },
}
