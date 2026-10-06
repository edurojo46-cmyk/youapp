export enum CircuitState {
    CLOSED,
    OPEN,
    HALF_OPEN
}

export class CircuitBreaker {
    private state: CircuitState = CircuitState.CLOSED;
    private windowSize: number;
    private minRequests: number;
    private errorThreshold: number; // e.g. 0.20 for 20%
    private openDurationMs: number;
    
    private requests: boolean[] = []; // true = success, false = failure
    private openedAt: number | null = null;
    
    // Half-open state
    private halfOpenProbes: number = 0;
    private maxHalfOpenProbes: number = 5;
    private halfOpenSuccesses: number = 0;

    constructor(
        windowSize: number = 100, 
        minRequests: number = 20, 
        errorThreshold: number = 0.20,
        openDurationMs: number = 30000
    ) {
        this.windowSize = windowSize;
        this.minRequests = minRequests;
        this.errorThreshold = errorThreshold;
        this.openDurationMs = openDurationMs;
    }

    public getState(): CircuitState {
        if (this.state === CircuitState.OPEN) {
            if (Date.now() - (this.openedAt || 0) > this.openDurationMs) {
                this.state = CircuitState.HALF_OPEN;
                this.halfOpenProbes = 0;
                this.halfOpenSuccesses = 0;
            }
        }
        return this.state;
    }

    public canExecute(): boolean {
        const currentState = this.getState();
        if (currentState === CircuitState.CLOSED) return true;
        if (currentState === CircuitState.OPEN) return false;
        if (currentState === CircuitState.HALF_OPEN) {
            if (this.halfOpenProbes < this.maxHalfOpenProbes) {
                this.halfOpenProbes++;
                return true;
            }
            return false;
        }
        return false;
    }

    public recordSuccess() {
        if (this.state === CircuitState.HALF_OPEN) {
            this.halfOpenSuccesses++;
            if (this.halfOpenSuccesses >= this.maxHalfOpenProbes) {
                this.reset();
            }
        } else {
            this.pushRequest(true);
        }
    }

    public recordFailure() {
        if (this.state === CircuitState.HALF_OPEN) {
            this.trip();
        } else {
            this.pushRequest(false);
        }
    }

    private pushRequest(success: boolean) {
        this.requests.push(success);
        if (this.requests.length > this.windowSize) {
            this.requests.shift();
        }
        this.checkState();
    }

    private checkState() {
        if (this.requests.length < this.minRequests) return;
        
        const failures = this.requests.filter(r => !r).length;
        const errorRate = failures / this.requests.length;
        
        if (errorRate > this.errorThreshold) {
            this.trip();
        }
    }

    private trip() {
        this.state = CircuitState.OPEN;
        this.openedAt = Date.now();
    }

    private reset() {
        this.state = CircuitState.CLOSED;
        this.requests = [];
        this.openedAt = null;
    }
}
