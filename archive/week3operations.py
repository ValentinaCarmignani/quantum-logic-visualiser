import math
currentcircuit=[]#stores the circuit as the user builds it interactively.
#ech entry is a gate tuple like ("H",0) or ("CNOT",0,1)
circuit=[("h",0),("CNOT",0,1),("Z",1,math.pi/2)]######
print(circuit)

class Spider:
    def __init__(self, spider_type, qubit, phase=0):
        #initialise a ZX-calculus "spider"(node in the graph).
        #type: "z" or "X" representing the basis.
        #qubit: which wire this spider belongs to.
        #phase: rotation(defaults to 0 if not specified).
        self.type=spider_type 
        self.qubit=qubit
        self.phase=phase
        #stores connections to other spiders(edges in the graph).
        self.connections=[]
        #positions on screen(used later for visualisation.
        self.x=0
        self.y=0
    def __str__(self):#added for clean printing.
        return f"{self.type}-spider (q{self.qubit},phase={self.phase})"#makes output more readable
def GateToSpider(gate):
    #converts a quantum gate into one or more spiders.
    #this forms a 'translation layer' from circuit to ZX graph.
    if gate[0] == "H":
        #create two spiders on the same qubit
        z=Spider("Z", gate[1])
        x=Spider("X", gate[1])
        #connect them (this is the hadamard)
        z.connections.append(x)
        x.connections.append(z)
        return[z,x]
    elif gate[0]=="Z":
        #Z gate becomes a Z-spider,possibly with a phase.
        if len(gate)==3:
            return [Spider("Z",gate[1],gate[2])]
        else:
            return[Spider("Z",gate[1])]
    elif gate[0]=="CNOT":
        #CNOT creates two spiders(control and target).
        control=Spider("Z",gate[1])
        target=Spider("X",gate[2])
        #connect them - this represents entanglement.
        control.connections.append(target)
        target.connections.append(control)
        return [control,target]
    else:
        #unknown gate, return nothing as a safe fallback.
        return []
def fuse(spider1, spider2):
    if spider1.type==spider2.type and spider1.qubit==spider2.qubit:
        spider1.phase+=spider2.phase #phaseaddition.
        return spider1
CNOTtest=GateToSpider(("CNOT",0,1))
for spider in CNOTtest:#testingcode.
    print(spider.type,"connected to",
          [s.type for s in spider.connections])
def ZXgraphbuild(circuit):
    #builds the full ZX graph from a list of gates.
    #output - a list of spiders with connections.
    graph=[]
    for gate in circuit:
        spiders=GateToSpider(gate)
        graph.extend(spiders)#add all spiders to this graph.
    return graph
def assignpositions(graph):
    #assigns 2D coordinates to each spider for drawing.
    #x=progression through circuit(left to right).
    #y=qubit index (top to bottom).
    for i, spider in enumerate(graph):
        spider.x=100+i*100
        spider.y=100+spider.qubit*100
zxgraph=ZXgraphbuild(circuit)
for spider in zxgraph:
    print(spider,"connected to",[f"{s.type}(q{s.qubit})" for s in spider.connections])
zxgraph=ZXgraphbuild(circuit)
assignpositions(zxgraph)
#Interactive visualisation - this section allows the user to build a quantum circuit live.
#Each gate entered is converted into a ZX graph and redrawn in real time.
#This demonstrates how abstract quantum operations map to graphical structures that are easier to understand.
import tkinter as tk
def drawgraph(graph):
    #creates a window and draws the ZX graph visually.
    root=tk.Tk()
    root.title("ZX graph demo")
    canvas=tk.Canvas(root,width=800,height=400)
    canvas.pack()
    #drawing the connections first so the lines apppear behind nodes.
    for spider in graph:
        for conn in spider.connections:
            canvas.create_line(spider.x,spider.y,conn.x,conn.y)
    #drawing spiders next(nodes)
    for spider in graph:
        #colour encodes spider type (Z=green,X=red)
        colour="green" if spider.type =="Z" else "red"
        canvas.create_oval(spider.x-15,spider.y-15,
                          spider.x+15,spider.y+15,
                          fill=colour)
        #label with qubit index
        canvas.create_text(spider.x,spider.y-25,
                          text=f"q{spider.qubit}")
    #keep the window open
    gate_entry=tk.Entry(root)
    gate_entry.pack()
    #input box where the user types the gate name (H,Z,CNOT).
    qubit_entry=tk.Entry(root)
    qubit_entry.pack()
    #input box where the user types the qubits.
    info_label=tk.Label(root, text="Enter gate (H, Z, or CNOT) and qubit(s)")
    info_label.pack()
    #instruction label to guide the user
    def updategraph():
            canvas.delete("all")#this clears the canvas so we can redraw from scratch.
            graph=ZXgraphbuild(currentcircuit)# rebuilds ZX graph from the updates circuit.
            assignpositions(graph)#assign screen coordinates to each spider.
            #draw connections
            for spider in graph:
                #draw connections for this spider
                for conn in spider.connections:
                    canvas.create_line(
                        spider.x,spider.y,
                        conn.x,conn.y,
                        width=2
                    )
            index=0 #which spider we're on.
            def drawstep():
                nonlocal index
                if index>= len(graph):
                    return #stop when finished
                spider=graph[index]
                #draw the spider node
                colour="green" if spider.type == "Z" else "red"
                canvas.create_oval(
                    spider.x-15, spider.y-15,
                    spider.x+15, spider.y+15,
                    fill=colour
                )
                #label it
                canvas.create_text(
                    spider.x,
                    spider.y-25,
                    text=f"{spider.type}(q{spider.qubit})"
                    )
                index+=1
                #schedule next step (300ms later)
                root.after(300, drawstep)
            drawstep()
    def addgate():#read the user input from text boxes
        gate=gate_entry.get().upper()
        qubits=qubit_entry.get()
        if gate=="CNOT":
            try:#remove spaces and split input like "0,1" into two integers.
                q0,q1=map(int, qubits.replace(" "," ").split(","))
                currentcircuit.append((gate,q0,q1))
                updategraph()#add a 2-qubit gate to the circuit
            except:#basic error handling for invalid input.
                print("Please enter CNOT qubits like:0,1")
        else:#single qubit gate
            q=int(qubits)
            currentcircuit.append((gate,q))
        updategraph()#redraw the graph to show the new circuit.
    addbutton=tk.Button(root,text="Add gate", command=addgate)
    addbutton.pack()#button that triggers addgate() when clicked.
    root.mainloop()#starts the Tkinter event loop (keeps the window open and responsive).
drawgraph(zxgraph)
