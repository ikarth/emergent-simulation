This is a custom presentation framework built on top of a p5js simulation.

Presentation style: Dark Grey text on near-white background, with full black and full white reserved for emphasis. Colors for emphasis, chosen from a perceptually-uniform color palette. Each color is associated with a concept in the presentation.

The presentation is rendered in an html page on top of a dynamic simulation. The presenter can advance to the next slide, go back, restart from the top, or display the outline in a sidebar panel and jump to a specific slide. A small slide count is shown in the lower right, with a faded dot for each presentation section remaining. Time since presentation start is shown in a tiny clock readout in the upper right. The presentation is initialized from a JSON file that controls the contents and is rendered by the javascript framework for presenting.

Configuration is defined in a JSON file, loaded on page refresh. It defines the hotkeys used to interact with the presentation: go forward (right key or D), go back (left key or A), restart (R) , stop/restart simulation (X), etc. 

The dynamic simulation has four layers:

* The border layer, a black border around the outside of the display, exactly coinciding with the field layer’s cell grid, giving the whole thing a border two or three grid cells deep.  
* The presentation layer, displaying the text and images of the presentation. Conventional pixels.  
* The agents layer: boids and slime molds and stuff live here. Each agent type gets an array of agent data, plus a rendering function and an update function. They interact with the field layers.  
  * Boids are drawn under the border layer and presentation layer. They fly in emergent flocks via the steering system. They are attracted to food and the border field grid cells. They consume the food fields they fly over and the border grid cells they collide with. If they have a current goal they seek it. If they reach their goal spawn a random goal in a reachable (non-avoiding) grid cell. They avoid “avoid field” cells and try to steer out/away from them.  
  * Slime molds. They also consume the food. They leave a trail behind them.  
* The fields layer. A set of arrays of points/grid cells, arranged in a grid covering the presentation canvas. The points are less dense than the presentation layer pixels, so for visible layers they end up displayed as fuzzy blobs of color.  
  * While a slide is being presented, the grid cells where text and images are displayed are marked in the “avoid” layer, which the boids use for steering collision avoidance.   
  * When the presenter leaves a slide, the contents of the slide get filtered through a noise pattern and rendered down into points in the “food” field layer, displayed at 20% of the saturation and brightness of the original side.   
  * Border field: after the border drops, the hidden border field (filling the same grid cells

When a slide enters the presentation layer, it can trigger a state change: adding agents, showing or hiding agents and layers, removing agents, etc.

Actions:

* Spawn some boids  
* Boids leave: give them random off-screen goals and despawn them when they are completely off canvas.  
* Toggle border avoidance: does the border affect the avoid field (i.e., can boids fly under it)  
* Spawn some predator boids: attracted to chasing down prey boids and slime molds.  
* Spawn some slime molds  
* Change slime mold parameters  
* Remove slime molds (trails gradually fade on their own)   
* Drop border: hide border layer, spawn consumable border field grid cells in its place as an exact visual replacement.  
* Hide/show all agents

Slides are defined in a markdown file, with \`---\` between each slide. We need to research existing presentation composition software to see if there’s something that makes it easy to visually edit the slide contents (just need images, text, good fonts, alignment)

—  
Section 1: Introduction.  
—  
Title: Why we like emergent simulation  
Presenter: *I’m here to talk about what is interesting about emergent simulations.*  
—  
Title: Why I like emergent simulation (“we” from the first slide is crossed out and “I” is substituted)  
Presenter: *This is really a personal survey with pretensions of defining a poetics, rather than an attempt to be completely thorough, so I’m going to focus on the aspects that I personally find interesting.*  
*—*  
Title: What is emergent simulation anyway?  
Presenter: *I’m intentionally being a bit loose with the definition here, attempting to encompass a class of processes that cut across more formal categorizations. In particular, I’m attempting to avoid being overly prescriptive, or implying that these are the only virtuous media objects.*  
*—*  
Text: A dynamic simulation with emergent effects  
(animation: gradual reveal of bullet points; the text is expanded into color-coded definitions)

* Simulation: an imitative representation of a process  
* Dynamic: the configuration of the system changes over time  
* Emergent: the complex system has more effects than are obvious from the component parts

Presenter: *Don’t get too hung up on the specifics here. It’s probably better to give you a few examples of things that I found inspiring.*  
—  
Sugarworld  
—  
Flocking Boids  
—  
Slime Mold  
—  
Dwarf Fortress  
—  
Section 2: Simulations are Abstractions  
—  
Simulations are abstractions  
Presenter: *Abstraction: a theoretical or general representation of something. A simulation summarizes the thing it represents. Same concept as an abstract for an article, really: it tries to capture everything in broad strokes so that you can understand it, but it is inevitably going to leave a lot of details out.*  
—  
Simulations are representations  
Presenter: *We have to remember that simulations are a model of something, not the thing itself. Every simulation makes compromises. Sometimes it is to make the modeling tractable with the available resources. Sometimes it is to make it understandable to humans. Sometimes it is because it is actually built on using one metaphor to represent another thing entirely.*  
—  
Simulations are not the thing they are modeling  
Presenter: *And often we don’t want them to be. The whole point is to make something safer, or more fun, or to do it more times, or some other impossible-in-reality property.*  
—  
*In procedural generation we sometimes make a teleological distinction between generators. In other words, you can generate a mountain by calculating continental drift and geological forces and erosion, or you can generate it via Perlin noise and a bunch of math. And depending on your purposes, the pile of math might be a better simulation for you.*

*(I’m indebted to Kate Compton for this example.)*  
—  
Simulations are their own thing  
Presenter: *On the other hand, simulations are their own thing, if we let them be. A city in SimCity only loosely resembles a real city, but it is an exact realization of a SimCity.*  
—  
Simulations can be used for rhetorical purposes  
Presenter: *Simulations can be used to convey a message that is distinct from being a model of the thing they are ostensibly representing. \[Examples from Procedural Rhetoric here.\]*  
—  
Section 3: Poetics of Emergent Simulations  
—  
Combining simulations  
SimCity deliberately combines a top-down System Dynamics simulation with a bottom-up Artificial Life simulation  
—  
Operational Logics  
A related concept is how different game logics can be associated with meaning; two objects colliding can be deployed to various rhetorical ends.  
—  
Language as simulation  
—  
Section 4: What are the limits?  
—  
Sometimes things aren’t better when they are simulated.  
The things that make games work, for example, often come from the weird friction and bespoke elements. A perfect clockwork mechanism has no room for interesting play, and a perfectly symmetric situation ends in a draw.  
—  
When we consider an interactive narrative work, the author has often pre-written a lot of the narrative. But this isn’t a bad thing, even from an emergent narrative viewpoint: the simulation in the author’s head can be a lot more bespoke and detailed than what we can directly capture in our simulation. Building an entire system for a one-off effect isn’t particularly efficient, especially when we can instead build a narrative content delivery system and let our authors deliver a great many unique narrative events.   
—  
Even so, we might be tempted to pile simulation on top of simulation, but the danger is that stacking simulations leads to abstraction decay.  
—  
Remember, each of these simulations is an abstraction, a metaphor with a list of assumptions. Building a metaphor on top of a metaphor on top of a metaphor can lead to some pretty dubious rhetoric.  
—  
Now, there’s often a lot of fun to be had with pushing games at precisely this point: seeing where the abstractions break down in funny ways. Breaking the game can be part of the fun. But there’s a deeper problem if you’re trying to do this approach for games: the level of indirect control can quickly lead you into a cursed problem.  
—  
Explain cursed problems.  
—  
Sandboxlets.  
—  
Exception: Dwarf Fortress builds systems on top of systems. The reason why it works is that it leans into the systems. There’s some abstraction going on here, yes. And sometimes that needs to be fixed, because the fish are punching you in the face or the cats are getting drunk. But by and large Dwarf Fortress embraces the limitations of the simulations and incorporates their failures into the gameplay.

So we can deal with too many simulations by isolating them into sandboxes. Or we can be like Dwarf Fortress and lean into it. But mostly you want to be open to the idea that some things don’t need to be emergent simulations.  
—  
Section: Conclusion  
—  
Simulation starts as metaphor  
—  
Pushes through the metaphor  
—  
Embrace escaping the metaphor  
—  
Interesting Emergent Simulation is metaphor taken too far  
—