let active = false;
let pending = false;
export const deviceTransitionActive = () => active || pending;
export const setDeviceTransitionActive = (value: boolean) => { active = value; };
export const setDeviceTransitionPending = (value: boolean) => { pending = value; };
