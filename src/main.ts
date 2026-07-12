import { AppController, type AppControllerConfig } from './app/AppController';

function readDevelopmentConfig(location: Location): AppControllerConfig {
  if (!import.meta.env.DEV) {
    return {};
  }

  return new URLSearchParams(location.search).get('capability') === 'supported'
    ? { capabilityOptions: { result: true } }
    : {};
}

const controller = new AppController(window.location, readDevelopmentConfig(window.location));
controller.start();
