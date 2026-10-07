// The planner on screen, for the welcome tour (WelcomeTour.vue): it shows the planner's controls
// at work on the player's build, then puts the build back exactly (snapshot and restore).
// Set by CharacterPlanner.vue while it is mounted; null otherwise.
import { shallowRef } from "vue";

export const activePlanner = shallowRef(null);
