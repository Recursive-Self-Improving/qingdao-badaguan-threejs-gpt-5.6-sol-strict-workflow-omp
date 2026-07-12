import {
  AppController,
  installPageHideHandler,
  type AppControllerConfig,
} from './app/AppController';

function readDevelopmentConfig(location: Location): AppControllerConfig {
  if (!import.meta.env.DEV) {
    return {};
  }

  const capability = new URLSearchParams(location.search).get('capability');
  if (capability === 'supported') {
    return { capabilityOptions: { result: true } };
  }
  if (capability === 'unsupported-then-supported') {
    let supported = false;
    return {
      capabilityOptions: {
        probe: () => {
          const result = supported;
          supported = true;
          return result;
        },
      },
    };
  }
  return {};
}

const controller = new AppController(window.location, readDevelopmentConfig(window.location));
controller.start();
installPageHideHandler(controller);
