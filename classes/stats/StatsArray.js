
class StatsArray extends Array {
	asc() {
		return this.sort((a, b) => a - b);
	}

	sum() {
		return this.reduce((a, b) => a + b, 0);
	}

	mean() {
		return this.sum() / this.length;
	}

	std() {
        const mu = this.mean();
        const diffArr = this.map(a => (a - mu) ** 2);
        const diffSum = diffArr.reduce((a, b) => a + b, 0);
        return Math.sqrt(diffSum / (this.length - 1));
	}

	quantile(q) {
        const sorted = this.asc();
        const pos = (sorted.length - 1) * q;
        const base = Math.floor(pos);
        const rest = pos - base;
        if (sorted[base + 1] !== undefined) {
            return sorted[base] + rest * (sorted[base + 1] - sorted[base]);
        } else {
            return sorted[base];
        }
	}
};

module.exports = StatsArray;