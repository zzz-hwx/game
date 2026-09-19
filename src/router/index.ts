import { createRouter, createWebHashHistory } from 'vue-router';
import { games } from '../games/registry';

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: () => import('../views/HomeView.vue'), meta: { title: '游戏大厅' } },
    ...games.map((game) => ({
      path: `/games/${game.id}`,
      name: game.id,
      component: game.component,
      meta: { title: game.name },
    })),
    { path: '/:pathMatch(.*)*', redirect: '/' },
  ],
  scrollBehavior: () => ({ top: 0 }),
});

router.afterEach((to) => {
  document.title = `${String(to.meta.title ?? '游戏大厅')} · 摸鱼俱乐部`;
});

export default router;
